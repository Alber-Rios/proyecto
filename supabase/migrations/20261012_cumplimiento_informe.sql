-- ==============================================================================
-- SPOTLY · MIGRACIÓN 2026-10-12 · CUMPLIMIENTO DEL INFORME DE PROYECTO (v5)
-- ==============================================================================
-- NO destructiva e idempotente: se puede ejecutar más de una vez sobre una base
-- que ya tiene aplicado supabase/reset-and-setup.sql. Conserva todos los datos.
--
-- Ejecutar completa en Supabase → SQL Editor (una sola ejecución).
--
-- Cubre:
--   RF-16 / RNF-03  Restricción de exclusión anti-sobreventa (btree_gist + tsrange)
--   RNF-06          Guardas de servidor sobre reservas, espacios y perfiles (RBAC)
--   RF-17           Tabla de pagos Webpay Plus (escrita solo por el backend)
--   RF-18           Política de cancelación con cálculo de reembolso en servidor
--   RF-21           Códigos de descuento validados en servidor
--   RF-13 / RF-34   Favoritos y notificaciones persistentes
--   RF-29           Valoraciones con respuesta del propietario
--   RF-30 / RF-31   Historial de solicitudes KYC (KPI-06)
--   RF-32           Reportes de publicaciones/usuarios y suspensión de cuentas
--   RF-33 / RNF-14  Auditoría solo-adición con IP real del request
--   RNF-04          Bloqueo temporal tras intentos de inicio de sesión fallidos
--   Cap. XI         Función de KPI para el tablero de administración
--   Tabla 62        RUT único (normalizado)
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==============================================================================
-- 0. HELPERS
-- ==============================================================================

-- IP real del cliente, tomada de las cabeceras que PostgREST expone por request.
CREATE OR REPLACE FUNCTION public.request_ip()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  headers JSON;
  raw TEXT;
BEGIN
  headers := NULLIF(current_setting('request.headers', true), '')::json;
  IF headers IS NULL THEN
    RETURN NULL;
  END IF;
  raw := COALESCE(headers->>'x-forwarded-for', headers->>'cf-connecting-ip', headers->>'x-real-ip');
  RETURN NULLIF(trim(split_part(COALESCE(raw, ''), ',', 1)), '');
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_user_agent()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN NULLIF(current_setting('request.headers', true), '')::json->>'user-agent';
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Llamadas de confianza: SQL Editor / service role (sin JWT de usuario) o funciones
-- internas que marcan la transacción con spotly.trusted = on. Los roles anon y
-- authenticated nunca son de confianza.
CREATE OR REPLACE FUNCTION public.is_trusted_context()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('spotly.trusted', true), '') = 'on'
      OR auth.role() = 'service_role'
      OR COALESCE(current_setting('role', true), '') = 'service_role'
      OR (
        auth.role() IS NULL
        AND COALESCE(current_setting('role', true), 'none') NOT IN ('anon', 'authenticated')
      );
$$;

CREATE OR REPLACE FUNCTION public.normalize_rut(r TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(upper(regexp_replace(COALESCE(r, ''), '[^0-9kK]', '', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.chile_today()
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'America/Santiago')::date;
$$;

-- ==============================================================================
-- 1. AUDITORÍA SOLO-ADICIÓN (RF-33, RNF-08, RNF-14)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.audit_logs_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- La IP y la fecha las fija el servidor; el cliente no puede falsificarlas.
  NEW.ip := COALESCE(public.request_ip(), CASE WHEN public.is_trusted_context() THEN NEW.ip END, 'no disponible');
  NEW.user_agent := COALESCE(public.request_user_agent(), NEW.user_agent);
  NEW.timestamp := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_set_request_metadata ON public.audit_logs;
CREATE TRIGGER audit_logs_set_request_metadata
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE PROCEDURE public.audit_logs_before_insert();

CREATE OR REPLACE FUNCTION public.audit_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs es una bitácora de solo adición: no admite % ', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE PROCEDURE public.audit_logs_append_only();

-- Registro de auditoría generado por el propio servidor (no depende del cliente).
CREATE OR REPLACE FUNCTION public.write_audit(
  p_action TEXT,
  p_severity TEXT,
  p_user_id TEXT,
  p_details JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_role TEXT;
BEGIN
  SELECT email, role INTO v_email, v_role FROM public.profiles WHERE id::text = p_user_id;
  INSERT INTO public.audit_logs (action, user_id, user_email, user_role, severity, details)
  VALUES (
    p_action,
    COALESCE(p_user_id, 'system'),
    COALESCE(v_email, 'sistema@spotly.cl'),
    COALESCE(v_role, 'admin'),
    p_severity,
    COALESCE(p_details, '{}'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.write_audit(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON public.audit_logs(severity);

-- ==============================================================================
-- 2. NOTIFICACIONES PERSISTENTES (RF-34)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('ntf'),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notificaciones propias" ON public.notifications;
CREATE POLICY "Notificaciones propias"
  ON public.notifications FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Crear notificaciones propias" ON public.notifications;
CREATE POLICY "Crear notificaciones propias"
  ON public.notifications FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Marcar notificaciones propias" ON public.notifications;
CREATE POLICY "Marcar notificaciones propias"
  ON public.notifications FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Eliminar notificaciones propias" ON public.notifications;
CREATE POLICY "Eliminar notificaciones propias"
  ON public.notifications FOR DELETE USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT DEFAULT 'info',
  p_link TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.notifications (user_id, title, message, type, link)
  VALUES (p_user_id, p_title, p_message, p_type, p_link);
END;
$$;
REVOKE ALL ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Tiempo real para la campana de notificaciones.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- ==============================================================================
-- 3. PERFILES: SUSPENSIÓN, RUT ÚNICO, HISTORIAL KYC (RF-32, RF-30/31, Tabla 62)
-- ==============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT public.normalize_rut(rut)
    FROM public.profiles
    WHERE public.normalize_rut(rut) IS NOT NULL
    GROUP BY 1 HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Hay RUT duplicados en profiles: corrígelos y vuelve a ejecutar para crear el índice único.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS profiles_rut_unique
      ON public.profiles (public.normalize_rut(rut))
      WHERE public.normalize_rut(rut) IS NOT NULL;
  END IF;
END $$;

-- Disponibilidad de RUT antes del registro (CP-02).
CREATE OR REPLACE FUNCTION public.rut_available(p_rut TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE public.normalize_rut(rut) = public.normalize_rut(p_rut)
  );
$$;
GRANT EXECUTE ON FUNCTION public.rut_available(TEXT) TO anon, authenticated;

-- Solo un administrador puede suspender o reactivar cuentas.
CREATE OR REPLACE FUNCTION public.guard_profile_suspension()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_trusted_context() OR public.is_admin() THEN
    IF NEW.is_suspended AND NOT OLD.is_suspended THEN
      NEW.suspended_at := now();
    ELSIF NOT NEW.is_suspended THEN
      NEW.suspended_at := NULL;
      NEW.suspended_reason := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
     OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at THEN
    RAISE EXCEPTION 'Solo un administrador puede suspender o reactivar cuentas';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profiles_suspension ON public.profiles;
CREATE TRIGGER guard_profiles_suspension
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.guard_profile_suspension();

CREATE TABLE IF NOT EXISTS public.kyc_verifications (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('kyc'),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'verified', 'rejected')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_user ON public.kyc_verifications(user_id, submitted_at DESC);
ALTER TABLE public.kyc_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "KYC propio o admin" ON public.kyc_verifications;
CREATE POLICY "KYC propio o admin"
  ON public.kyc_verifications FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.track_kyc_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open_id TEXT;
BEGIN
  IF NEW.verification_status IS NOT DISTINCT FROM OLD.verification_status THEN
    RETURN NEW;
  END IF;

  IF NEW.verification_status = 'pending_review' THEN
    INSERT INTO public.kyc_verifications (user_id, status, submitted_at)
    VALUES (NEW.id, 'pending_review', COALESCE(NULLIF(NEW.kyc_data->>'submittedAt', '')::timestamptz, now()));
    PERFORM public.write_audit('KYC_SUBMITTED', 'security', NEW.id::text, jsonb_build_object('userId', NEW.id));
  ELSIF NEW.verification_status IN ('verified', 'rejected') THEN
    SELECT id INTO v_open_id
    FROM public.kyc_verifications
    WHERE user_id = NEW.id AND status = 'pending_review'
    ORDER BY submitted_at DESC
    LIMIT 1;

    IF v_open_id IS NULL THEN
      INSERT INTO public.kyc_verifications (user_id, status, submitted_at, resolved_at, resolved_by, rejection_reason)
      VALUES (NEW.id, NEW.verification_status, now(), now(), auth.uid(), NEW.kyc_rejection_reason);
    ELSE
      UPDATE public.kyc_verifications
      SET status = NEW.verification_status,
          resolved_at = now(),
          resolved_by = auth.uid(),
          rejection_reason = CASE WHEN NEW.verification_status = 'rejected' THEN NEW.kyc_rejection_reason END
      WHERE id = v_open_id;
    END IF;

    PERFORM public.write_audit(
      CASE WHEN NEW.verification_status = 'verified' THEN 'KYC_APPROVED' ELSE 'KYC_REJECTED' END,
      'security',
      COALESCE(auth.uid()::text, 'system'),
      jsonb_build_object('targetUserId', NEW.id, 'reason', NEW.kyc_rejection_reason)
    );
    PERFORM public.notify_user(
      NEW.id,
      CASE WHEN NEW.verification_status = 'verified'
        THEN 'Verificación de identidad aprobada'
        ELSE 'Verificación de identidad rechazada' END,
      CASE WHEN NEW.verification_status = 'verified'
        THEN 'Tu identidad fue verificada por el equipo de Spotly. Ya puedes reservar y publicar espacios.'
        ELSE 'Tu solicitud fue rechazada. Motivo: ' || COALESCE(NEW.kyc_rejection_reason, 'no informado') || '. Puedes volver a enviar tus documentos.' END,
      CASE WHEN NEW.verification_status = 'verified' THEN 'success' ELSE 'warning' END,
      '/onboarding'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_profiles_kyc_status ON public.profiles;
CREATE TRIGGER track_profiles_kyc_status
  AFTER UPDATE OF verification_status ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.track_kyc_status();

-- Respaldo: solicitudes que ya estaban pendientes antes de esta migración.
INSERT INTO public.kyc_verifications (user_id, status, submitted_at)
SELECT p.id, 'pending_review', COALESCE(NULLIF(p.kyc_data->>'submittedAt', '')::timestamptz, p.updated_at)
FROM public.profiles p
WHERE p.verification_status = 'pending_review'
  AND NOT EXISTS (SELECT 1 FROM public.kyc_verifications k WHERE k.user_id = p.id AND k.status = 'pending_review');

-- ==============================================================================
-- 4. BLOQUEO POR INTENTOS FALLIDOS DE INICIO DE SESIÓN (RNF-04, CP-03)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.login_attempts (
  email TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo accesible mediante las funciones siguientes.

CREATE OR REPLACE FUNCTION public.login_lock_status(p_email TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'locked', COALESCE(max(locked_until) > now(), false),
    'locked_until', CASE WHEN max(locked_until) > now() THEN max(locked_until) END
  )
  FROM public.login_attempts
  WHERE email = lower(trim(p_email));
$$;

CREATE OR REPLACE FUNCTION public.register_failed_login(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_max_attempts CONSTANT INTEGER := 5;
  c_window CONSTANT INTERVAL := interval '15 minutes';
  c_lock CONSTANT INTERVAL := interval '15 minutes';
  v_email TEXT := lower(trim(p_email));
  v_row public.login_attempts;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('locked', false, 'remaining', c_max_attempts);
  END IF;

  INSERT INTO public.login_attempts AS la (email, failed_count, first_failed_at, updated_at)
  VALUES (v_email, 1, now(), now())
  ON CONFLICT (email) DO UPDATE SET
    failed_count = CASE
      WHEN la.first_failed_at IS NULL
        OR la.first_failed_at < now() - c_window
        OR (la.locked_until IS NOT NULL AND la.locked_until <= now())
      THEN 1 ELSE la.failed_count + 1 END,
    first_failed_at = CASE
      WHEN la.first_failed_at IS NULL
        OR la.first_failed_at < now() - c_window
        OR (la.locked_until IS NOT NULL AND la.locked_until <= now())
      THEN now() ELSE la.first_failed_at END,
    locked_until = CASE
      WHEN la.locked_until IS NOT NULL AND la.locked_until <= now()
      THEN NULL ELSE la.locked_until END,
    updated_at = now()
  RETURNING * INTO v_row;

  IF v_row.failed_count >= c_max_attempts AND (v_row.locked_until IS NULL OR v_row.locked_until <= now()) THEN
    UPDATE public.login_attempts SET locked_until = now() + c_lock WHERE email = v_email RETURNING * INTO v_row;
    PERFORM public.write_audit(
      'ACCOUNT_TEMPORARILY_LOCKED', 'security',
      COALESCE((SELECT id::text FROM public.profiles WHERE lower(email) = v_email), 'anonymous'),
      jsonb_build_object('email', v_email, 'lockedUntil', v_row.locked_until, 'failedAttempts', v_row.failed_count)
    );
  END IF;

  RETURN jsonb_build_object(
    'locked', COALESCE(v_row.locked_until > now(), false),
    'locked_until', v_row.locked_until,
    'remaining', GREATEST(c_max_attempts - v_row.failed_count, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_login_attempts()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.login_attempts WHERE email = lower(COALESCE(auth.email(), ''));
$$;

GRANT EXECUTE ON FUNCTION public.login_lock_status(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_failed_login(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_login_attempts() TO authenticated;

-- ==============================================================================
-- 5. ESPACIOS: CAMPOS PROTEGIDOS (RNF-06)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.guard_space_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_trusted_context() OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_suspended) THEN
    RAISE EXCEPTION 'Tu cuenta está suspendida: no puedes publicar ni modificar espacios';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Toda publicación nueva pasa por moderación y parte sin valoraciones.
    NEW.status := 'pending_approval';
    NEW.is_verified := false;
    NEW.rating := 0;
    NEW.reviews_count := 0;
    NEW.owner_verified := COALESCE(
      (SELECT verification_status = 'verified' FROM public.profiles WHERE id = auth.uid()), false);
  ELSE
    -- La reputación y la verificación solo las cambia el sistema o un admin.
    NEW.rating := OLD.rating;
    NEW.reviews_count := OLD.reviews_count;
    NEW.is_verified := OLD.is_verified;
    NEW.owner_verified := OLD.owner_verified;
    NEW.owner_id := OLD.owner_id;
    -- El propietario puede pausar/reactivar una publicación aprobada, pero no autoaprobarse.
    IF OLD.status = 'pending_approval' AND NEW.status = 'active' THEN
      NEW.status := OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_spaces_write ON public.spaces;
CREATE TRIGGER guard_spaces_write
  BEFORE INSERT OR UPDATE ON public.spaces
  FOR EACH ROW EXECUTE PROCEDURE public.guard_space_write();

ALTER TABLE public.spaces ALTER COLUMN rating SET DEFAULT 0;

-- ==============================================================================
-- 6. CÓDIGOS DE DESCUENTO (RF-21)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.discount_codes (
  code TEXT PRIMARY KEY CHECK (code = upper(code) AND length(code) BETWEEN 3 AND 30),
  description TEXT,
  percent_off INTEGER NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
  max_discount_clp NUMERIC(12,0) CHECK (max_discount_clp IS NULL OR max_discount_clp > 0),
  valid_from DATE,
  valid_until DATE,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Administración de códigos de descuento" ON public.discount_codes;
CREATE POLICY "Administración de códigos de descuento"
  ON public.discount_codes FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.discount_codes (code, description, percent_off, max_discount_clp, max_uses)
VALUES ('SPOTLY10', 'Descuento de bienvenida del piloto (10% sobre el arriendo)', 10, 50000, 500)
ON CONFLICT (code) DO NOTHING;

-- Calcula el descuento aplicable sobre el subtotal (no sobre comisión ni garantía).
CREATE OR REPLACE FUNCTION public.compute_discount(p_code TEXT, p_subtotal NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.discount_codes;
  v_amount NUMERIC;
BEGIN
  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN jsonb_build_object('valid', false, 'discount_clp', 0, 'message', 'Sin código');
  END IF;

  SELECT * INTO v FROM public.discount_codes WHERE code = upper(trim(p_code));
  IF NOT FOUND OR NOT v.active THEN
    RETURN jsonb_build_object('valid', false, 'discount_clp', 0, 'message', 'El código no existe o no está activo');
  END IF;
  IF v.valid_from IS NOT NULL AND public.chile_today() < v.valid_from THEN
    RETURN jsonb_build_object('valid', false, 'discount_clp', 0, 'message', 'El código aún no está vigente');
  END IF;
  IF v.valid_until IS NOT NULL AND public.chile_today() > v.valid_until THEN
    RETURN jsonb_build_object('valid', false, 'discount_clp', 0, 'message', 'El código está vencido');
  END IF;
  IF v.max_uses IS NOT NULL AND v.used_count >= v.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'discount_clp', 0, 'message', 'El código alcanzó su límite de usos');
  END IF;

  v_amount := round(COALESCE(p_subtotal, 0) * v.percent_off / 100.0);
  IF v.max_discount_clp IS NOT NULL THEN
    v_amount := LEAST(v_amount, v.max_discount_clp);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'code', v.code,
    'percent_off', v.percent_off,
    'max_discount_clp', v.max_discount_clp,
    'discount_clp', v_amount,
    'message', v.percent_off || '% de descuento aplicado'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.compute_discount(TEXT, NUMERIC) TO authenticated;

-- ==============================================================================
-- 7. RESERVAS: ANTI-SOBREVENTA, PAGO, CANCELACIÓN Y REEMBOLSO
-- ==============================================================================

ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS discount_code TEXT;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS discount_clp NUMERIC(12,0) NOT NULL DEFAULT 0;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS refund_amount_clp NUMERIC(12,0);
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Reservas creadas antes de la integración real quedan marcadas como simulación.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservations_payment_status_check'
  ) THEN
    UPDATE public.reservations SET payment_status = 'legacy_simulated';
    ALTER TABLE public.reservations ADD CONSTRAINT reservations_payment_status_check
      CHECK (payment_status IN ('pending', 'paid', 'failed', 'refund_pending', 'refunded',
                                'partially_refunded', 'not_required', 'legacy_simulated'));
  END IF;
END $$;

-- Período ocupado como rango de tiempo (hora local de Chile, sin zona).
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS booking_period tsrange
  GENERATED ALWAYS AS (
    CASE
      WHEN hour_start IS NOT NULL AND hour_end IS NOT NULL
           AND (end_date > start_date OR hour_end > hour_start)
      THEN tsrange(start_date + make_interval(hours => hour_start),
                   end_date + make_interval(hours => hour_end), '[)')
      ELSE tsrange(start_date::timestamp, (end_date + 1)::timestamp, '[)')
    END
  ) STORED;

-- Antes de crear la restricción se anulan solapamientos heredados del modo simulado.
UPDATE public.reservations r
SET status = 'cancelled',
    cancellation_reason = 'Anulada en migración: se solapaba con una reserva anterior del mismo espacio',
    cancelled_at = now()
WHERE r.status IN ('pending', 'confirmed')
  AND EXISTS (
    SELECT 1 FROM public.reservations o
    WHERE o.space_id = r.space_id
      AND o.id <> r.id
      AND o.status IN ('pending', 'confirmed')
      AND o.booking_period && r.booking_period
      AND (o.created_at, o.id) < (r.created_at, r.id)
  );

ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_no_overlap;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (space_id WITH =, booking_period WITH &&)
  WHERE (status IN ('pending', 'confirmed'));

CREATE INDEX IF NOT EXISTS idx_reservations_payment_status ON public.reservations(payment_status);

-- Libera bloques retenidos por pagos que no se completaron (20 minutos).
CREATE OR REPLACE FUNCTION public.release_expired_payment_holds(p_space_id TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM set_config('spotly.trusted', 'on', true);
  UPDATE public.reservations
  SET status = 'cancelled',
      payment_status = 'failed',
      cancelled_at = now(),
      cancellation_reason = 'El pago no se completó dentro de 20 minutos; el horario fue liberado'
  WHERE status = 'pending'
    AND payment_status = 'pending'
    AND created_at < now() - interval '20 minutes'
    AND (p_space_id IS NULL OR space_id = p_space_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('spotly.trusted', 'off', true);
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.release_expired_payment_holds(TEXT) TO authenticated;

-- Montos esperados según la tarifa publicada (misma regla que src/utils/pricing.ts).
CREATE OR REPLACE FUNCTION public.expected_reservation_amounts(
  p_space public.spaces,
  p_price_unit TEXT,
  p_start DATE,
  p_end DATE,
  p_hour_start INTEGER,
  p_hour_end INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_days INTEGER := (p_end - p_start) + 1;
  v_units INTEGER;
  v_price NUMERIC;
  v_subtotal NUMERIC;
  v_fee NUMERIC;
  v_deposit NUMERIC;
BEGIN
  IF p_price_unit = 'hour' THEN
    v_units := GREATEST(COALESCE(p_hour_end - p_hour_start, 1), 1);
    v_price := COALESCE(NULLIF(p_space.price_per_hour, 0), 45000);
  ELSIF p_price_unit = 'month' THEN
    v_units := GREATEST(ceil(v_days / 30.0)::int, 1);
    v_price := COALESCE(NULLIF(p_space.price_per_month, 0), 3800000);
  ELSE
    v_units := GREATEST(v_days, 1);
    v_price := p_space.price_per_day;
  END IF;

  v_subtotal := v_units * v_price;
  v_fee := round(v_subtotal * 0.05);
  v_deposit := CASE
    WHEN COALESCE(p_space.security_deposit, 0) > 0 THEN p_space.security_deposit
    WHEN p_price_unit = 'hour' THEN 50000
    ELSE 150000
  END;

  RETURN jsonb_build_object(
    'units', v_units,
    'subtotal', v_subtotal,
    'platform_fee', v_fee,
    'deposit', v_deposit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_reservation_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_space public.spaces;
  v_expected JSONB;
  v_discount JSONB;
  v_unit TEXT;
BEGIN
  IF public.is_trusted_context() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_suspended) THEN
    RAISE EXCEPTION 'Tu cuenta está suspendida: no puedes realizar reservas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND verification_status = 'verified')
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Debes tener tu identidad verificada por un administrador para reservar';
  END IF;

  SELECT * INTO v_space FROM public.spaces WHERE id = NEW.space_id;
  IF NOT FOUND OR v_space.status <> 'active' THEN
    RAISE EXCEPTION 'El espacio no está disponible para reservas';
  END IF;

  IF NEW.start_date < public.chile_today() THEN
    RAISE EXCEPTION 'La fecha de la reserva debe ser desde el día actual hacia adelante';
  END IF;
  IF NEW.hour_start IS NOT NULL AND NEW.hour_end IS NOT NULL
     AND NEW.start_date = NEW.end_date AND NEW.hour_end <= NEW.hour_start THEN
    RAISE EXCEPTION 'La hora de término debe ser posterior a la hora de inicio';
  END IF;

  -- Libera retenciones vencidas del mismo espacio antes de verificar la exclusión.
  PERFORM public.release_expired_payment_holds(NEW.space_id);

  v_unit := COALESCE(NEW.price_unit, 'day');
  v_expected := public.expected_reservation_amounts(
    v_space, v_unit, NEW.start_date, NEW.end_date, NEW.hour_start, NEW.hour_end);

  IF abs(NEW.subtotal_clp - (v_expected->>'subtotal')::numeric) > 1
     OR abs(NEW.platform_fee_clp - (v_expected->>'platform_fee')::numeric) > 1
     OR abs(NEW.security_deposit_clp - (v_expected->>'deposit')::numeric) > 1 THEN
    RAISE EXCEPTION 'Monto inconsistente con la tarifa publicada (esperado subtotal %, comisión %, garantía %)',
      v_expected->>'subtotal', v_expected->>'platform_fee', v_expected->>'deposit';
  END IF;

  NEW.discount_clp := 0;
  IF NEW.discount_code IS NOT NULL AND trim(NEW.discount_code) <> '' THEN
    v_discount := public.compute_discount(NEW.discount_code, NEW.subtotal_clp);
    IF NOT (v_discount->>'valid')::boolean THEN
      RAISE EXCEPTION 'Código de descuento inválido: %', v_discount->>'message';
    END IF;
    NEW.discount_code := v_discount->>'code';
    NEW.discount_clp := (v_discount->>'discount_clp')::numeric;
    UPDATE public.discount_codes SET used_count = used_count + 1 WHERE code = NEW.discount_code;
  ELSE
    NEW.discount_code := NULL;
  END IF;

  IF abs(NEW.total_clp - (NEW.subtotal_clp + NEW.platform_fee_clp + NEW.security_deposit_clp - NEW.discount_clp)) > 1 THEN
    RAISE EXCEPTION 'El total no coincide con subtotal + comisión + garantía − descuento';
  END IF;

  NEW.owner_id := v_space.owner_id;
  NEW.status := 'pending';
  NEW.payment_status := 'pending';
  NEW.payment_simulation := NULL;
  NEW.confirmed_at := NULL;
  NEW.paid_at := NULL;
  NEW.refund_amount_clp := NULL;
  NEW.cancelled_at := NULL;
  NEW.cancelled_by := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_reservations_insert ON public.reservations;
CREATE TRIGGER guard_reservations_insert
  BEFORE INSERT ON public.reservations
  FOR EACH ROW EXECUTE PROCEDURE public.guard_reservation_insert();

-- Política de cancelación (Anexo legal / RF-18), misma regla que src/utils/refundPolicy.ts:
--   ≥ 48 h antes del inicio: 100 % del arriendo pagado + garantía
--   24–48 h antes:            50 % del arriendo pagado + garantía
--   < 24 h antes:              solo la garantía
--   La comisión de servicio no es reembolsable, salvo que cancele el propietario,
--   el administrador o que el propietario rechace la solicitud (100 % del total).
CREATE OR REPLACE FUNCTION public.compute_refund(
  p_res public.reservations,
  p_by_tenant BOOLEAN
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start TIMESTAMP := p_res.start_date + make_interval(hours => COALESCE(p_res.hour_start, 0));
  v_hours NUMERIC := EXTRACT(EPOCH FROM (v_start - (now() AT TIME ZONE 'America/Santiago'))) / 3600.0;
  v_rent NUMERIC := GREATEST(p_res.subtotal_clp - COALESCE(p_res.discount_clp, 0), 0);
BEGIN
  IF NOT p_by_tenant THEN
    RETURN p_res.total_clp;
  END IF;
  IF v_hours >= 48 THEN
    RETURN v_rent + p_res.security_deposit_clp;
  ELSIF v_hours >= 24 THEN
    RETURN round(v_rent * 0.5) + p_res.security_deposit_clp;
  ELSE
    RETURN p_res.security_deposit_clp;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_reservation_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin BOOLEAN;
  v_tenant BOOLEAN;
  v_owner BOOLEAN;
  v_mutable TEXT[] := ARRAY['status', 'dispute_status', 'dispute_reason', 'digital_contract_id',
                            'cancellation_reason', 'updated_at', 'booking_period'];
  v_refund NUMERIC;
BEGIN
  IF public.is_trusted_context() THEN
    RETURN NEW;
  END IF;

  v_admin := public.is_admin();
  v_tenant := auth.uid() = OLD.tenant_id;
  v_owner := auth.uid() = OLD.owner_id;

  IF NOT v_admin AND (to_jsonb(NEW) - v_mutable) IS DISTINCT FROM (to_jsonb(OLD) - v_mutable) THEN
    RAISE EXCEPTION 'Solo se puede modificar el estado de la reserva; montos, fechas y pagos son inmutables';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelled' THEN
      IF OLD.status NOT IN ('pending', 'confirmed') THEN
        RAISE EXCEPTION 'Solo se pueden cancelar reservas pendientes o confirmadas';
      END IF;
      IF NOT (v_tenant OR v_owner OR v_admin) THEN
        RAISE EXCEPTION 'No autorizado para cancelar esta reserva';
      END IF;
      v_refund := public.compute_refund(OLD, v_tenant AND NOT v_admin);
      NEW.cancelled_at := now();
      NEW.cancelled_by := auth.uid();
      NEW.cancellation_reason := COALESCE(NULLIF(trim(NEW.cancellation_reason), ''),
        CASE WHEN v_tenant THEN 'Cancelada por el arrendatario' WHEN v_owner THEN 'Cancelada por el propietario' ELSE 'Cancelada por administración' END);

    ELSIF NEW.status = 'rejected' THEN
      IF OLD.status <> 'pending' OR NOT (v_owner OR v_admin) THEN
        RAISE EXCEPTION 'Solo el propietario puede rechazar solicitudes pendientes';
      END IF;
      v_refund := OLD.total_clp;
      NEW.cancelled_at := now();
      NEW.cancelled_by := auth.uid();

    ELSIF NEW.status = 'confirmed' THEN
      IF OLD.status <> 'pending' OR NOT (v_owner OR v_admin) THEN
        RAISE EXCEPTION 'Solo el propietario puede aceptar solicitudes pendientes';
      END IF;
      IF OLD.payment_status NOT IN ('paid', 'legacy_simulated', 'not_required') THEN
        RAISE EXCEPTION 'La reserva no se puede aceptar hasta que el pago esté aprobado';
      END IF;
      IF COALESCE(OLD.end_date, OLD.start_date) < public.chile_today() THEN
        RAISE EXCEPTION 'No es posible aprobar una reserva cuya fecha ya transcurrió';
      END IF;
      NEW.confirmed_at := now();

    ELSIF NEW.status = 'completed' THEN
      IF OLD.status <> 'confirmed' OR NOT (v_owner OR v_admin) THEN
        RAISE EXCEPTION 'Solo una reserva confirmada puede marcarse como finalizada';
      END IF;

    ELSIF NOT v_admin THEN
      RAISE EXCEPTION 'Transición de estado no permitida';
    END IF;

    IF v_refund IS NOT NULL THEN
      NEW.refund_amount_clp := v_refund;
      NEW.payment_status := CASE
        WHEN OLD.payment_status = 'paid' AND v_refund > 0 THEN 'refund_pending'
        WHEN OLD.payment_status = 'pending' THEN 'failed'
        ELSE OLD.payment_status
      END;
      IF OLD.payment_status = 'pending' THEN
        NEW.refund_amount_clp := 0;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_reservations_update ON public.reservations;
CREATE TRIGGER guard_reservations_update
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE PROCEDURE public.guard_reservation_update();

-- Auditoría y notificaciones generadas por el servidor.
CREATE OR REPLACE FUNCTION public.reservation_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_text TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('RESERVATION_CREATED', 'info', NEW.tenant_id::text,
      jsonb_build_object('reservationId', NEW.id, 'spaceId', NEW.space_id, 'totalClp', NEW.total_clp,
                         'discountClp', NEW.discount_clp, 'period', NEW.booking_period::text));
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status AND NEW.payment_status = 'paid' THEN
    PERFORM public.notify_user(NEW.owner_id, 'Nueva reserva pagada',
      format('"%s" fue reservado del %s al %s por %s. %s', NEW.space_title, NEW.start_date, NEW.end_date, NEW.tenant_name,
        CASE WHEN NEW.status = 'pending' THEN 'Debes aceptarla o rechazarla.' ELSE 'Quedó confirmada automáticamente.' END),
      'info', '/owner');
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_status_text := CASE NEW.status
      WHEN 'confirmed' THEN 'confirmada'
      WHEN 'cancelled' THEN 'cancelada'
      WHEN 'rejected' THEN 'rechazada'
      WHEN 'completed' THEN 'finalizada'
      ELSE NEW.status END;

    PERFORM public.write_audit('RESERVATION_STATUS_CHANGED',
      CASE WHEN NEW.status IN ('cancelled', 'rejected') THEN 'warning' ELSE 'info' END,
      COALESCE(auth.uid()::text, 'system'),
      jsonb_build_object('reservationId', NEW.id, 'from', OLD.status, 'to', NEW.status,
                         'refundAmountClp', NEW.refund_amount_clp, 'paymentStatus', NEW.payment_status,
                         'reason', NEW.cancellation_reason));

    PERFORM public.notify_user(NEW.tenant_id, 'Reserva ' || v_status_text,
      format('Tu reserva de "%s" (%s) está %s.%s', NEW.space_title, NEW.start_date, v_status_text,
        CASE WHEN COALESCE(NEW.refund_amount_clp, 0) > 0
          THEN format(' Reembolso: $%s CLP.', to_char(NEW.refund_amount_clp, 'FM999G999G999'))
          ELSE '' END),
      CASE WHEN NEW.status IN ('confirmed', 'completed') THEN 'success' ELSE 'warning' END,
      '/my-bookings');

    IF auth.uid() IS DISTINCT FROM NEW.owner_id AND NEW.status IN ('cancelled', 'completed') THEN
      PERFORM public.notify_user(NEW.owner_id, 'Reserva ' || v_status_text,
        format('La reserva de "%s" (%s) está %s.', NEW.space_title, NEW.start_date, v_status_text),
        'info', '/owner');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservations_events ON public.reservations;
CREATE TRIGGER reservations_events
  AFTER INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE PROCEDURE public.reservation_events();

-- Ocupación pública de un espacio (sin datos personales) para el calendario (RF-14).
CREATE OR REPLACE FUNCTION public.get_space_occupancy(p_space_id TEXT)
RETURNS TABLE (
  start_date DATE,
  end_date DATE,
  hour_start INTEGER,
  hour_end INTEGER,
  rental_modality TEXT,
  duration_units NUMERIC,
  total_days INTEGER,
  status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.start_date, r.end_date, r.hour_start, r.hour_end, r.rental_modality,
         r.duration_units, r.total_days, r.status
  FROM public.reservations r
  WHERE r.space_id = p_space_id
    AND r.status IN ('pending', 'confirmed')
    AND r.end_date >= public.chile_today() - 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_space_occupancy(TEXT) TO anon, authenticated;

-- ==============================================================================
-- 8. PAGOS WEBPAY PLUS (RF-17) — escritos solo por el backend (service role)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.payments (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('pay'),
  reservation_id TEXT NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'webpay_plus',
  environment TEXT NOT NULL DEFAULT 'integration' CHECK (environment IN ('integration', 'production')),
  buy_order TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  token TEXT UNIQUE,
  amount_clp NUMERIC(12,0) NOT NULL CHECK (amount_clp > 0),
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'authorized', 'failed', 'aborted', 'refunded', 'partially_refunded')),
  response_code INTEGER,
  authorization_code TEXT,
  card_last4 TEXT,
  payment_type_code TEXT,
  installments_number INTEGER,
  transaction_date TIMESTAMPTZ,
  raw_response JSONB,
  refunded_amount_clp NUMERIC(12,0) NOT NULL DEFAULT 0,
  refund_response JSONB,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_reservation ON public.payments(reservation_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_authorized_per_reservation
  ON public.payments(reservation_id) WHERE status IN ('authorized', 'refunded', 'partially_refunded');
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pagos visibles para las partes o admin" ON public.payments;
CREATE POLICY "Pagos visibles para las partes o admin"
  ON public.payments FOR SELECT
  USING (
    tenant_id = auth.uid() OR public.is_admin() OR EXISTS (
      SELECT 1 FROM public.reservations r WHERE r.id = payments.reservation_id AND r.owner_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS set_payments_updated_at ON public.payments;
CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

CREATE OR REPLACE FUNCTION public.payment_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  PERFORM public.write_audit(
    'PAYMENT_' || upper(NEW.status),
    CASE WHEN NEW.status IN ('failed', 'aborted') THEN 'warning' ELSE 'security' END,
    NEW.tenant_id::text,
    jsonb_build_object('paymentId', NEW.id, 'reservationId', NEW.reservation_id, 'buyOrder', NEW.buy_order,
                       'amountClp', NEW.amount_clp, 'responseCode', NEW.response_code,
                       'authorizationCode', NEW.authorization_code, 'refundedClp', NEW.refunded_amount_clp)
  );

  IF NEW.status = 'authorized' THEN
    PERFORM public.notify_user(NEW.tenant_id, 'Pago aprobado',
      format('Webpay Plus aprobó tu pago de $%s CLP (autorización %s).', to_char(NEW.amount_clp, 'FM999G999G999'), NEW.authorization_code),
      'success', '/my-bookings');
  ELSIF NEW.status IN ('failed', 'aborted') THEN
    PERFORM public.notify_user(NEW.tenant_id, 'Pago no completado',
      'El pago fue rechazado o anulado. El horario quedó liberado y no se realizó ningún cargo.',
      'warning', '/my-bookings');
  ELSIF NEW.status IN ('refunded', 'partially_refunded') THEN
    PERFORM public.notify_user(NEW.tenant_id, 'Reembolso procesado',
      format('Se reversaron $%s CLP a tu medio de pago mediante Webpay Plus.', to_char(NEW.refunded_amount_clp, 'FM999G999G999')),
      'success', '/my-bookings');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_events ON public.payments;
CREATE TRIGGER payments_events
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE PROCEDURE public.payment_events();

-- ==============================================================================
-- 9. CONTRATOS: SHA-256 REAL E IP DEL FIRMANTE (RF-24, RF-26, RNF-08)
-- ==============================================================================

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS hash_algorithm TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS hash_version TEXT;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS signer_ip TEXT;

CREATE OR REPLACE FUNCTION public.contracts_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.signer_ip := COALESCE(public.request_ip(), NEW.signer_ip);
  NEW.created_at := now();
  IF NEW.hash_algorithm = 'SHA-256' AND NEW.contract_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'El hash del contrato debe ser un SHA-256 hexadecimal de 64 caracteres';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_set_request_metadata ON public.contracts;
CREATE TRIGGER contracts_set_request_metadata
  BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE PROCEDURE public.contracts_before_insert();

CREATE OR REPLACE FUNCTION public.contracts_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_trusted_context() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'Los contratos firmados son inmutables';
END;
$$;

DROP TRIGGER IF EXISTS contracts_no_update_delete ON public.contracts;
CREATE TRIGGER contracts_no_update_delete
  BEFORE UPDATE OR DELETE ON public.contracts
  FOR EACH ROW EXECUTE PROCEDURE public.contracts_immutable();

CREATE OR REPLACE FUNCTION public.contract_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.write_audit('CONTRACT_SIGNED', 'security', COALESCE(auth.uid()::text, 'system'),
    jsonb_build_object('contractId', NEW.id, 'reservationId', NEW.reservation_id,
                       'hash', NEW.contract_hash, 'algorithm', NEW.hash_algorithm, 'signerIp', NEW.signer_ip));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_events ON public.contracts;
CREATE TRIGGER contracts_events
  AFTER INSERT ON public.contracts
  FOR EACH ROW EXECUTE PROCEDURE public.contract_events();

-- ==============================================================================
-- 10. FAVORITOS (RF-13)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.favorites (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  space_id TEXT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, space_id)
);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Favoritos propios" ON public.favorites;
CREATE POLICY "Favoritos propios"
  ON public.favorites FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ==============================================================================
-- 11. VALORACIONES (RF-29, KPI-08)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.reviews (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('rev'),
  space_id TEXT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  reservation_id TEXT NOT NULL UNIQUE REFERENCES public.reservations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_name TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT CHECK (comment IS NULL OR length(comment) <= 1000),
  owner_reply TEXT CHECK (owner_reply IS NULL OR length(owner_reply) <= 1000),
  owner_replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_space ON public.reviews(space_id, created_at DESC);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Valoraciones públicas" ON public.reviews;
CREATE POLICY "Valoraciones públicas" ON public.reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Arrendatario valora reservas finalizadas" ON public.reviews;
CREATE POLICY "Arrendatario valora reservas finalizadas"
  ON public.reviews FOR INSERT
  WITH CHECK (
    tenant_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND r.tenant_id = auth.uid()
        AND r.space_id = reviews.space_id
        AND (r.status = 'completed' OR (r.status = 'confirmed' AND r.end_date <= public.chile_today()))
    )
  );

DROP POLICY IF EXISTS "Autor o propietario editan la valoración" ON public.reviews;
CREATE POLICY "Autor o propietario editan la valoración"
  ON public.reviews FOR UPDATE
  USING (
    tenant_id = auth.uid() OR public.is_admin() OR EXISTS (
      SELECT 1 FROM public.spaces s WHERE s.id = reviews.space_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Autor o admin eliminan la valoración" ON public.reviews;
CREATE POLICY "Autor o admin eliminan la valoración"
  ON public.reviews FOR DELETE USING (tenant_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.guard_review_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF public.is_trusted_context() OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  NEW.space_id := OLD.space_id;
  NEW.reservation_id := OLD.reservation_id;
  NEW.tenant_id := OLD.tenant_id;
  NEW.created_at := OLD.created_at;
  IF auth.uid() = OLD.tenant_id THEN
    -- El autor edita su calificación y comentario, no la respuesta.
    NEW.owner_reply := OLD.owner_reply;
    NEW.owner_replied_at := OLD.owner_replied_at;
  ELSE
    -- El propietario solo responde.
    NEW.rating := OLD.rating;
    NEW.comment := OLD.comment;
    NEW.tenant_name := OLD.tenant_name;
    IF NEW.owner_reply IS DISTINCT FROM OLD.owner_reply THEN
      NEW.owner_replied_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_reviews_update ON public.reviews;
CREATE TRIGGER guard_reviews_update
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE PROCEDURE public.guard_review_update();

CREATE OR REPLACE FUNCTION public.refresh_space_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_space TEXT := COALESCE(NEW.space_id, OLD.space_id);
  v_owner UUID;
BEGIN
  PERFORM set_config('spotly.trusted', 'on', true);
  UPDATE public.spaces s
  SET rating = COALESCE((SELECT round(avg(rating)::numeric, 1) FROM public.reviews WHERE space_id = v_space), 0),
      reviews_count = (SELECT count(*) FROM public.reviews WHERE space_id = v_space)
  WHERE s.id = v_space
  RETURNING owner_id INTO v_owner;
  PERFORM set_config('spotly.trusted', 'off', true);

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(v_owner, 'Nueva valoración',
      format('%s calificó tu espacio con %s/5. Puedes responder desde el detalle de la publicación.', NEW.tenant_name, NEW.rating),
      'info', '/space/' || v_space);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS reviews_refresh_rating ON public.reviews;
CREATE TRIGGER reviews_refresh_rating
  AFTER INSERT OR UPDATE OF rating OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE PROCEDURE public.refresh_space_rating();

-- Recalcula la reputación real de todos los espacios (antes era 5.0 fijo).
DO $$
BEGIN
  PERFORM set_config('spotly.trusted', 'on', true);
  UPDATE public.spaces s
  SET rating = COALESCE((SELECT round(avg(rating)::numeric, 1) FROM public.reviews r WHERE r.space_id = s.id), 0),
      reviews_count = (SELECT count(*) FROM public.reviews r WHERE r.space_id = s.id);
  PERFORM set_config('spotly.trusted', 'off', true);
END $$;

-- ==============================================================================
-- 12. REPORTES DE PUBLICACIONES Y USUARIOS (RF-32)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.user_reports (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('rpt'),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reporter_email TEXT,
  target_type TEXT NOT NULL CHECK (target_type IN ('space', 'user')),
  target_space_id TEXT REFERENCES public.spaces(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_label TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL CHECK (length(description) BETWEEN 10 AND 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  admin_notes TEXT,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_reports_target_check CHECK (
    (target_type = 'space' AND target_space_id IS NOT NULL) OR
    (target_type = 'user' AND target_user_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON public.user_reports(status, created_at DESC);
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Crear reportes propios" ON public.user_reports;
CREATE POLICY "Crear reportes propios"
  ON public.user_reports FOR INSERT WITH CHECK (reporter_id = auth.uid() AND status = 'open');
DROP POLICY IF EXISTS "Ver reportes propios o admin" ON public.user_reports;
CREATE POLICY "Ver reportes propios o admin"
  ON public.user_reports FOR SELECT USING (reporter_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "Gestionar reportes admin" ON public.user_reports;
CREATE POLICY "Gestionar reportes admin"
  ON public.user_reports FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.report_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('REPORT_CREATED', 'warning', NEW.reporter_id::text,
      jsonb_build_object('reportId', NEW.id, 'targetType', NEW.target_type, 'target', NEW.target_label, 'category', NEW.category));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('resolved', 'dismissed') THEN
      NEW.resolved_at := COALESCE(NEW.resolved_at, now());
      NEW.resolved_by := COALESCE(NEW.resolved_by, auth.uid());
    END IF;
    PERFORM public.write_audit('REPORT_' || upper(NEW.status), 'security', COALESCE(auth.uid()::text, 'system'),
      jsonb_build_object('reportId', NEW.id, 'notes', NEW.admin_notes));
    PERFORM public.notify_user(NEW.reporter_id, 'Actualización de tu reporte',
      format('Tu reporte sobre "%s" quedó en estado: %s.', NEW.target_label,
        CASE NEW.status WHEN 'reviewing' THEN 'en revisión' WHEN 'resolved' THEN 'resuelto' WHEN 'dismissed' THEN 'desestimado' ELSE NEW.status END),
      'info', NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_reports_events ON public.user_reports;
CREATE TRIGGER user_reports_events
  BEFORE INSERT OR UPDATE ON public.user_reports
  FOR EACH ROW EXECUTE PROCEDURE public.report_events();

-- Suspensión de cuentas por administración, con auditoría y aviso.
CREATE OR REPLACE FUNCTION public.admin_set_user_suspension(p_user_id UUID, p_suspend BOOLEAN, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede suspender cuentas';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes suspender tu propia cuenta';
  END IF;

  UPDATE public.profiles
  SET is_suspended = p_suspend,
      suspended_reason = CASE WHEN p_suspend THEN NULLIF(trim(p_reason), '') END
  WHERE id = p_user_id;

  IF p_suspend THEN
    -- Las publicaciones del usuario suspendido se pausan.
    PERFORM set_config('spotly.trusted', 'on', true);
    UPDATE public.spaces SET status = 'paused' WHERE owner_id = p_user_id AND status = 'active';
    PERFORM set_config('spotly.trusted', 'off', true);
  END IF;

  PERFORM public.write_audit(CASE WHEN p_suspend THEN 'ADMIN_USER_SUSPENDED' ELSE 'ADMIN_USER_REACTIVATED' END,
    'critical', auth.uid()::text, jsonb_build_object('targetUserId', p_user_id, 'reason', p_reason));
  PERFORM public.notify_user(p_user_id,
    CASE WHEN p_suspend THEN 'Cuenta suspendida' ELSE 'Cuenta reactivada' END,
    CASE WHEN p_suspend THEN 'Tu cuenta fue suspendida por administración. Motivo: ' || COALESCE(p_reason, 'no informado') || '. Escríbenos desde Ayuda y soporte.'
         ELSE 'Tu cuenta fue reactivada. Ya puedes volver a operar en Spotly.' END,
    CASE WHEN p_suspend THEN 'error' ELSE 'success' END, '/support');
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_user_suspension(UUID, BOOLEAN, TEXT) TO authenticated;

-- ==============================================================================
-- 13. VISITAS AL DETALLE (KPI-04 tasa de conversión)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.space_views (
  id BIGSERIAL PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  viewer_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_space_views_created ON public.space_views(created_at DESC);
ALTER TABLE public.space_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Registrar visita al detalle" ON public.space_views;
CREATE POLICY "Registrar visita al detalle"
  ON public.space_views FOR INSERT
  WITH CHECK (viewer_id IS NULL OR viewer_id = auth.uid());
DROP POLICY IF EXISTS "Visitas visibles para admin" ON public.space_views;
CREATE POLICY "Visitas visibles para admin"
  ON public.space_views FOR SELECT USING (public.is_admin());

-- ==============================================================================
-- 14. TABLERO DE KPI (Capítulo XI, Tabla 66)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_kpis(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_hours_per_day CONSTANT NUMERIC := 12; -- horario operativo publicado (08:00–20:00)
  v_from TIMESTAMPTZ := now() - make_interval(days => p_days);
  v_prev_from TIMESTAMPTZ := now() - make_interval(days => p_days * 2);
  v_active_spaces INTEGER;
  v_booked_hours NUMERIC;
  v_prev_booked_hours NUMERIC;
  v_occupancy NUMERIC;
  v_prev_occupancy NUMERIC;
  v_confirm_minutes NUMERIC;
  v_overbooking INTEGER;
  v_views INTEGER;
  v_conversions INTEGER;
  v_confirmed INTEGER;
  v_with_contract INTEGER;
  v_kyc_hours NUMERIC;
  v_created INTEGER;
  v_cancelled INTEGER;
  v_rating NUMERIC;
  v_reviews INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores';
  END IF;

  SELECT count(*) INTO v_active_spaces FROM public.spaces WHERE status = 'active';

  SELECT COALESCE(sum(CASE
           WHEN hour_start IS NOT NULL AND hour_end IS NOT NULL THEN (hour_end - hour_start) * ((end_date - start_date) + 1)
           ELSE ((end_date - start_date) + 1) * c_hours_per_day END), 0)
    INTO v_booked_hours
  FROM public.reservations
  WHERE status IN ('confirmed', 'completed') AND created_at >= v_from;

  SELECT COALESCE(sum(CASE
           WHEN hour_start IS NOT NULL AND hour_end IS NOT NULL THEN (hour_end - hour_start) * ((end_date - start_date) + 1)
           ELSE ((end_date - start_date) + 1) * c_hours_per_day END), 0)
    INTO v_prev_booked_hours
  FROM public.reservations
  WHERE status IN ('confirmed', 'completed') AND created_at >= v_prev_from AND created_at < v_from;

  v_occupancy := CASE WHEN v_active_spaces > 0
    THEN round(100 * v_booked_hours / (v_active_spaces * p_days * c_hours_per_day), 1) END;
  v_prev_occupancy := CASE WHEN v_active_spaces > 0
    THEN round(100 * v_prev_booked_hours / (v_active_spaces * p_days * c_hours_per_day), 1) END;

  SELECT round(avg(EXTRACT(EPOCH FROM (confirmed_at - created_at)) / 60.0)::numeric, 1)
    INTO v_confirm_minutes
  FROM public.reservations
  WHERE confirmed_at IS NOT NULL AND confirmed_at >= v_from;

  SELECT count(*) INTO v_overbooking
  FROM public.reservations a
  JOIN public.reservations b
    ON a.space_id = b.space_id AND a.id < b.id AND a.booking_period && b.booking_period
  WHERE a.status IN ('pending', 'confirmed') AND b.status IN ('pending', 'confirmed');

  SELECT count(*) INTO v_views FROM public.space_views WHERE created_at >= v_from;
  SELECT count(*) INTO v_conversions FROM public.reservations
  WHERE created_at >= v_from AND status IN ('confirmed', 'completed');

  SELECT count(*) INTO v_confirmed FROM public.reservations
  WHERE status IN ('confirmed', 'completed') AND created_at >= v_from;
  SELECT count(DISTINCT r.id) INTO v_with_contract
  FROM public.reservations r
  JOIN public.contracts c ON c.reservation_id = r.id
  WHERE r.status IN ('confirmed', 'completed') AND r.created_at >= v_from
    AND c.contract_hash IS NOT NULL AND c.signature_image IS NOT NULL;

  SELECT round(avg(EXTRACT(EPOCH FROM (resolved_at - submitted_at)) / 3600.0)::numeric, 1)
    INTO v_kyc_hours
  FROM public.kyc_verifications
  WHERE resolved_at IS NOT NULL AND resolved_at >= v_from;

  SELECT count(*), count(*) FILTER (WHERE status = 'cancelled' AND COALESCE(payment_status, '') <> 'failed')
    INTO v_created, v_cancelled
  FROM public.reservations
  WHERE created_at >= v_from AND payment_status <> 'failed';

  SELECT round(avg(rating)::numeric, 2), count(*) INTO v_rating, v_reviews FROM public.reviews;

  RETURN jsonb_build_object(
    'period_days', p_days,
    'generated_at', now(),
    'kpi01_occupancy_pct', v_occupancy,
    'kpi01_prev_occupancy_pct', v_prev_occupancy,
    'kpi01_variation_pct', CASE WHEN COALESCE(v_prev_occupancy, 0) > 0
      THEN round(100 * (v_occupancy - v_prev_occupancy) / v_prev_occupancy, 1) END,
    'kpi02_confirmation_minutes', v_confirm_minutes,
    'kpi03_overbooking_count', v_overbooking,
    'kpi04_conversion_pct', CASE WHEN v_views > 0 THEN round(100.0 * v_conversions / v_views, 2) END,
    'kpi04_views', v_views,
    'kpi04_conversions', v_conversions,
    'kpi05_contract_pct', CASE WHEN v_confirmed > 0 THEN round(100.0 * v_with_contract / v_confirmed, 1) END,
    'kpi05_confirmed', v_confirmed,
    'kpi06_kyc_review_hours', v_kyc_hours,
    'kpi07_cancellation_pct', CASE WHEN v_created > 0 THEN round(100.0 * v_cancelled / v_created, 1) END,
    'kpi07_created', v_created,
    'kpi08_avg_rating', v_rating,
    'kpi08_reviews', v_reviews
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_kpis(INTEGER) TO authenticated;

-- ==============================================================================
-- 15. PERMISOS
-- ==============================================================================
GRANT SELECT ON public.reviews TO anon;
GRANT INSERT ON public.space_views TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.space_views_id_seq TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.notifications, public.favorites, public.reviews, public.user_reports,
  public.discount_codes, public.space_views
  TO authenticated;
GRANT SELECT ON public.payments, public.kyc_verifications TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

COMMIT;
