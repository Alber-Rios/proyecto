-- ==============================================================================
-- SPOTLY · ACTUALIZAR BASE (script único, 2026-11-11)
-- ==============================================================================
-- Úsalo si tu base ya existe y tiene datos: NO borra nada.
-- Junta en orden todos los cambios hechos después de reset-and-setup.sql:
--   1. Verificación de correo y seguridad de acceso
--   2. Solicitudes que vencen sin respuesta
--   3. Cancelación según 24 horas
--   4. Comisiones, liquidaciones, ganancias y auditoría encadenada (SHA-256)
-- Se puede ejecutar más de una vez sin problema.
--
-- Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
--
-- ¿Base nueva o quieres empezar de cero? Ejecuta solo reset-and-setup.sql
-- (ese sí borra todo y ya trae estos cambios incluidos).
-- ==============================================================================

-- ==============================================================================
-- 1. VERIFICACIÓN DE CORREO Y SEGURIDAD DE ACCESO
-- ==============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.auth_account_status(p_email TEXT)
RETURNS TABLE (user_id UUID, email_confirmed BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id, (u.email_confirmed_at IS NOT NULL), u.created_at
  FROM auth.users u
  WHERE lower(u.email) = left(lower(trim(COALESCE(p_email, ''))), 320)
  LIMIT 1;
$$;

-- Las cuentas que no validaron su correo en 24 horas se eliminan (y con ellas su
-- perfil, por ON DELETE CASCADE): un registro sin verificar no queda guardado.
CREATE OR REPLACE FUNCTION public.purge_unconfirmed_accounts()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM auth.users
  WHERE email_confirmed_at IS NULL
    AND created_at < now() - interval '24 hours';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sin permiso para depurar auth.users; se omite.';
END;
$$;

CREATE OR REPLACE FUNCTION public.run_maintenance()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.release_expired_payment_holds(NULL);
  PERFORM public.expire_unanswered_requests();
  PERFORM public.purge_old_login_attempts();
  PERFORM public.purge_unconfirmed_accounts();
  DELETE FROM public.space_views WHERE created_at < now() - interval '400 days';
  DELETE FROM public.notifications WHERE read AND created_at < now() - interval '180 days';
END;
$$;

-- Estas funciones solo las usa el backend (/api/auth con service_role): el navegador
-- no puede consultarlas, así nadie puede averiguar qué correos o RUT están registrados.
REVOKE ALL ON FUNCTION public.check_signup_availability(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_account_status(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_unconfirmed_accounts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_signup_availability(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_account_status(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_unconfirmed_accounts() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_maintenance() TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ==============================================================================
-- 2. SOLICITUDES QUE VENCEN SIN RESPUESTA
-- ==============================================================================
BEGIN;

-- Vencimiento sin depender de pg_cron: la app llama esta función al cargar las
-- reservas y cada pocos minutos. Solo toca las solicitudes de quien la llama
-- (como anfitrión o arrendatario) y aplica la misma regla que
-- expire_unanswered_requests(): al llegar la hora de inicio, rechazo con
-- devolución del 100 %.
CREATE OR REPLACE FUNCTION public.expire_my_unanswered_requests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_prev TEXT;
  v_count INTEGER;
  v_hour INTEGER := extract(hour FROM (now() AT TIME ZONE 'America/Santiago'))::int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;
  v_prev := public.begin_trusted();
  UPDATE public.reservations
  SET status = 'rejected',
      payment_status = CASE WHEN payment_status = 'paid' THEN 'refund_pending' ELSE payment_status END,
      refund_amount_clp = CASE WHEN payment_status = 'paid' THEN total_clp ELSE 0 END,
      cancelled_at = now(),
      cancellation_reason = 'El anfitrión no respondió la solicitud antes de la fecha de inicio'
  WHERE status = 'pending'
    AND (owner_id = v_uid OR tenant_id = v_uid)
    AND payment_status IN ('paid', 'legacy_simulated', 'not_required')
    AND (start_date < public.chile_today()
         OR (start_date = public.chile_today() AND (hour_start IS NULL OR hour_start <= v_hour)));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.end_trusted(v_prev);
  RETURN v_count;
END;
$$;

-- Nadie puede aprobar una solicitud cuya hora de inicio ya llegó, aunque el
-- trabajo de mantenimiento todavía no la haya vencido.
CREATE OR REPLACE FUNCTION public.block_late_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hour INTEGER := extract(hour FROM (now() AT TIME ZONE 'America/Santiago'))::int;
BEGIN
  IF NEW.start_date < public.chile_today()
     OR (NEW.start_date = public.chile_today() AND (NEW.hour_start IS NULL OR NEW.hour_start <= v_hour)) THEN
    RAISE EXCEPTION 'La solicitud venció: su hora de inicio ya pasó. Se rechaza automáticamente con devolución del 100 %%.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_late_approval ON public.reservations;
CREATE TRIGGER trg_block_late_approval
  BEFORE UPDATE OF status ON public.reservations
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status = 'confirmed')
  EXECUTE FUNCTION public.block_late_approval();

REVOKE ALL ON FUNCTION public.expire_my_unanswered_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_my_unanswered_requests() TO authenticated;

-- 4. Las solicitudes que ya vencieron se rechazan ahora (con devolución del 100 %).
SELECT public.expire_unanswered_requests() AS solicitudes_vencidas;

COMMIT;

-- 3. Mantenimiento automático cada 5 minutos (si pg_cron está disponible).
--    Si aparece un aviso "pg_cron no disponible", actívalo en
--    Database → Extensions → pg_cron y vuelve a ejecutar solo este bloque.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('spotly-maintenance', '*/5 * * * *', 'SELECT public.run_maintenance()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron no disponible (%): la app vencerá las solicitudes al cargar', SQLERRM;
END $$;

-- ==============================================================================
-- 3. CANCELACIÓN SEGÚN 24 HORAS
-- ==============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.compute_refund(
  p_res public.reservations,
  p_by_tenant BOOLEAN
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start TIMESTAMP := p_res.start_date + make_interval(hours => COALESCE(p_res.hour_start, 0));
  v_hours NUMERIC := EXTRACT(EPOCH FROM (v_start - (now() AT TIME ZONE 'America/Santiago'))) / 3600.0;
  v_rent NUMERIC := GREATEST(p_res.subtotal_clp - COALESCE(p_res.discount_clp, 0), 0);
BEGIN
  IF NOT p_by_tenant THEN
    RETURN p_res.total_clp;
  END IF;
  -- Con 24 h o más se devuelve todo; con menos de 24 h solo se cobra la comisión.
  IF v_hours >= 24 THEN
    RETURN v_rent + p_res.security_deposit_clp + COALESCE(p_res.platform_fee_clp, 0);
  ELSE
    RETURN v_rent + p_res.security_deposit_clp;
  END IF;
END;
$$;

-- Bloquea la cancelación del arrendatario después del inicio del arriendo.
CREATE OR REPLACE FUNCTION public.guard_reservation_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin BOOLEAN;
  v_tenant BOOLEAN;
  v_owner BOOLEAN;
  v_mutable TEXT[] := ARRAY['status', 'dispute_status', 'dispute_reason',
                            'cancellation_reason', 'updated_at', 'booking_period'];
  v_refund NUMERIC;
BEGIN
  IF public.is_trusted_context() THEN
    RETURN NEW;
  END IF;

  v_admin := public.is_admin();
  v_tenant := auth.uid() = OLD.tenant_id;
  v_owner := auth.uid() = OLD.owner_id;

  IF NOT v_admin THEN
    -- El vínculo con el contrato lo fija el disparador de contratos.
    NEW.digital_contract_id := OLD.digital_contract_id;
    -- El estado de disputa se sincroniza desde la tabla disputes; el cliente
    -- solo puede marcar la apertura (none -> opened) como parte de la reserva.
    IF NEW.dispute_status IS DISTINCT FROM OLD.dispute_status
       AND NOT (COALESCE(OLD.dispute_status, 'none') = 'none' AND NEW.dispute_status = 'opened'
                AND (v_tenant OR v_owner)) THEN
      RAISE EXCEPTION 'El estado de la disputa lo gestiona la administración';
    END IF;
    IF NEW.dispute_reason IS DISTINCT FROM OLD.dispute_reason
       AND NEW.dispute_status IS NOT DISTINCT FROM OLD.dispute_status THEN
      NEW.dispute_reason := OLD.dispute_reason;
    END IF;
  END IF;

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
      -- El arrendatario solo puede cancelar antes de que empiece el arriendo;
      -- después, un problema se reporta como reclamo (lo revisa administración).
      IF v_tenant AND NOT v_owner AND NOT v_admin
         AND (OLD.start_date + make_interval(hours => COALESCE(OLD.hour_start, 0)))
             <= (now() AT TIME ZONE 'America/Santiago') THEN
        RAISE EXCEPTION 'El arriendo ya comenzó y no se puede cancelar. Si hubo un problema, repórtalo desde la reserva.';
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

COMMIT;

-- ==============================================================================
-- 4. COMISIONES, LIQUIDACIONES, GANANCIAS Y AUDITORÍA
-- ==============================================================================
BEGIN;

-- ==============================================================================
-- Comisiones, liquidaciones, reporte financiero y bitácora encadenada (2026-11-11)
-- ==============================================================================
-- Modelo de cobro:
--   · Arrendatario: cargo de servicio del 5 % sobre el arriendo (platform_fee_clp).
--   · Anfitrión: comisión del 10 % (5 % en arriendos mensuales) que se descuenta
--     de su liquidación. Queda en 0 % durante la etapa de lanzamiento y en sus
--     primeras reservas (bienvenida). La tasa se congela al crear la reserva.
--   · Los códigos de descuento los paga Spotly: el anfitrión recibe lo mismo.

-- ---------- Configuración de comisiones (una sola fila) ----------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  owner_commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.10
    CHECK (owner_commission_rate BETWEEN 0 AND 0.30),
  owner_commission_rate_monthly NUMERIC(5,4) NOT NULL DEFAULT 0.05
    CHECK (owner_commission_rate_monthly BETWEEN 0 AND 0.30),
  launch_ends_on DATE NOT NULL DEFAULT DATE '2027-05-31',
  owner_free_bookings INTEGER NOT NULL DEFAULT 3 CHECK (owner_free_bookings BETWEEN 0 AND 50),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
COMMENT ON TABLE public.platform_settings IS 'Comisiones vigentes de la plataforma (una fila)';
INSERT INTO public.platform_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Comisiones visibles para todos" ON public.platform_settings;
CREATE POLICY "Comisiones visibles para todos"
  ON public.platform_settings FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.platform_settings FROM anon, authenticated;
GRANT SELECT ON public.platform_settings TO anon, authenticated;

-- ---------- Columnas nuevas ----------
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS owner_commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0
    CHECK (owner_commission_rate BETWEEN 0 AND 0.30),
  ADD COLUMN IF NOT EXISTS owner_commission_clp NUMERIC(12,0) NOT NULL DEFAULT 0
    CHECK (owner_commission_clp >= 0),
  ADD COLUMN IF NOT EXISTS owner_commission_reason TEXT
    CHECK (owner_commission_reason IS NULL OR length(owner_commission_reason) <= 40);
ALTER TABLE public.owner_payouts
  ADD COLUMN IF NOT EXISTS owner_commission_clp NUMERIC(12,0) NOT NULL DEFAULT 0
    CHECK (owner_commission_clp >= 0);
ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS is_furnished BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.spaces.is_furnished IS
  'Amoblado o equipado: su arriendo puede estar afecto a IVA (lo declara el anfitrión)';

-- ---------- Tasa de comisión del anfitrión ----------
CREATE OR REPLACE FUNCTION public.owner_commission_terms(p_owner UUID, p_price_unit TEXT)
RETURNS TABLE (rate NUMERIC, reason TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s public.platform_settings;
  v_done INTEGER;
BEGIN
  SELECT * INTO s FROM public.platform_settings WHERE id;
  IF NOT FOUND THEN
    rate := 0.10; reason := 'estandar'; RETURN NEXT; RETURN;
  END IF;
  IF public.chile_today() <= s.launch_ends_on THEN
    rate := 0; reason := 'lanzamiento'; RETURN NEXT; RETURN;
  END IF;
  SELECT count(*) INTO v_done
  FROM public.reservations
  WHERE owner_id = p_owner
    AND status IN ('confirmed', 'completed')
    AND payment_status IN ('paid', 'partially_refunded', 'refund_pending');
  IF v_done < s.owner_free_bookings THEN
    rate := 0; reason := 'bienvenida'; RETURN NEXT; RETURN;
  END IF;
  IF p_price_unit = 'month' THEN
    rate := s.owner_commission_rate_monthly; reason := 'mensual';
  ELSE
    rate := s.owner_commission_rate; reason := 'estandar';
  END IF;
  RETURN NEXT;
END;
$$;

-- La tasa se fija al crear la reserva y no cambia después (ni por el cliente
-- ni por cambios posteriores de configuración).
CREATE OR REPLACE FUNCTION public.reservations_owner_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v FROM public.owner_commission_terms(NEW.owner_id, COALESCE(NEW.price_unit, 'day'));
    NEW.owner_commission_rate := v.rate;
    NEW.owner_commission_reason := v.reason;
    NEW.owner_commission_clp := round(COALESCE(NEW.subtotal_clp, 0) * v.rate);
  ELSE
    NEW.owner_commission_rate := OLD.owner_commission_rate;
    NEW.owner_commission_reason := OLD.owner_commission_reason;
    NEW.owner_commission_clp := OLD.owner_commission_clp;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservations_owner_commission ON public.reservations;
CREATE TRIGGER reservations_owner_commission
  BEFORE INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.reservations_owner_commission();

-- ---------- Finalización automática y liquidación ----------
-- Una reserva confirmada cuyo período terminó pasa a 'completed'. Eso genera la
-- liquidación del anfitrión (reservation_events) y, si había garantía y no hay
-- reclamo abierto, pide su devolución al arrendatario.
CREATE OR REPLACE FUNCTION public.complete_finished_reservations(p_user UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev TEXT;
  v_count INTEGER;
  v_hour INTEGER := extract(hour FROM (now() AT TIME ZONE 'America/Santiago'))::int;
BEGIN
  v_prev := public.begin_trusted();
  UPDATE public.reservations r
  SET status = 'completed',
      payment_status = CASE
        WHEN r.security_deposit_clp > 0 AND r.payment_status = 'paid'
             AND COALESCE(r.dispute_status, 'none') IN ('none', 'resolved')
          THEN 'refund_pending' ELSE r.payment_status END,
      refund_amount_clp = CASE
        WHEN r.security_deposit_clp > 0 AND r.payment_status = 'paid'
             AND COALESCE(r.dispute_status, 'none') IN ('none', 'resolved')
          THEN r.security_deposit_clp ELSE r.refund_amount_clp END
  WHERE r.status = 'confirmed'
    AND (p_user IS NULL OR r.owner_id = p_user OR r.tenant_id = p_user)
    AND (r.end_date < public.chile_today()
         OR (r.end_date = public.chile_today() AND r.hour_end IS NOT NULL AND r.hour_end <= v_hour));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.end_trusted(v_prev);
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_my_finished_reservations()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN 0 ELSE public.complete_finished_reservations(auth.uid()) END;
$$;

-- Liquidaciones: se audita su creación y cada cambio de estado.
CREATE OR REPLACE FUNCTION public.owner_payout_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('PAYOUT_CREATED', 'info', NEW.owner_id::text,
      jsonb_build_object('payoutId', NEW.id, 'reservationId', NEW.reservation_id,
                         'grossClp', NEW.gross_clp, 'ownerCommissionClp', NEW.owner_commission_clp,
                         'amountClp', NEW.amount_clp, 'status', NEW.status));
    PERFORM public.notify_user(NEW.owner_id, 'Liquidación generada',
      format('Tu arriendo terminó. Te corresponden $%s CLP (arriendo $%s menos comisión $%s).',
        to_char(NEW.amount_clp, 'FM999G999G999'), to_char(NEW.gross_clp, 'FM999G999G999'),
        to_char(NEW.owner_commission_clp, 'FM999G999G999')),
      'success', '/owner');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.write_audit('PAYOUT_' || upper(NEW.status), 'security',
      COALESCE(auth.uid()::text, 'system'),
      jsonb_build_object('payoutId', NEW.id, 'reservationId', NEW.reservation_id, 'ownerId', NEW.owner_id,
                         'from', OLD.status, 'to', NEW.status, 'amountClp', NEW.amount_clp,
                         'transferReference', NEW.transfer_reference));
    IF NEW.status = 'paid' THEN
      PERFORM public.notify_user(NEW.owner_id, 'Transferencia enviada',
        format('Te transferimos $%s CLP. Referencia: %s.', to_char(NEW.amount_clp, 'FM999G999G999'),
               COALESCE(NEW.transfer_reference, 'sin referencia')),
        'success', '/owner');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS owner_payout_events ON public.owner_payouts;
CREATE TRIGGER owner_payout_events
  AFTER INSERT OR UPDATE ON public.owner_payouts
  FOR EACH ROW EXECUTE FUNCTION public.owner_payout_events();

CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(p_payout_id TEXT, p_reference TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores';
  END IF;
  IF COALESCE(length(trim(p_reference)), 0) < 3 THEN
    RAISE EXCEPTION 'Indica el número o referencia de la transferencia';
  END IF;
  UPDATE public.owner_payouts
  SET status = 'paid', transfer_reference = left(trim(p_reference), 200), paid_at = now()
  WHERE id = p_payout_id AND status IN ('pending', 'on_hold');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La liquidación no existe o ya fue pagada';
  END IF;
END;
$$;

-- ---------- Cambiar comisiones (solo admin, auditado) ----------
CREATE OR REPLACE FUNCTION public.admin_update_platform_settings(
  p_owner_commission_rate NUMERIC,
  p_owner_commission_rate_monthly NUMERIC,
  p_launch_ends_on DATE,
  p_owner_free_bookings INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before public.platform_settings;
  v_after public.platform_settings;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores';
  END IF;
  SELECT * INTO v_before FROM public.platform_settings WHERE id;
  UPDATE public.platform_settings
  SET owner_commission_rate = p_owner_commission_rate,
      owner_commission_rate_monthly = p_owner_commission_rate_monthly,
      launch_ends_on = p_launch_ends_on,
      owner_free_bookings = p_owner_free_bookings,
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id
  RETURNING * INTO v_after;
  PERFORM public.write_audit('PLATFORM_SETTINGS_CHANGED', 'critical', auth.uid()::text,
    jsonb_build_object('before', to_jsonb(v_before) - 'id', 'after', to_jsonb(v_after) - 'id'));
END;
$$;

-- ---------- Reporte financiero de la plataforma ----------
-- Una fila por reserva pagada. La fecha es la del pago autorizado por Transbank.
--   ingreso Spotly = cargo al arrendatario + comisión al anfitrión − descuento
--                    (reservas vigentes o finalizadas)
--                  = lo que no se devolvió (canceladas o rechazadas)
CREATE OR REPLACE FUNCTION public.platform_ledger(p_from DATE, p_to DATE)
RETURNS TABLE (
  reservation_id TEXT, paid_at TIMESTAMPTZ, space_id TEXT, space_title TEXT,
  tenant_name TEXT, owner_id UUID, owner_name TEXT, status TEXT, payment_status TEXT,
  collected_clp NUMERIC, subtotal_clp NUMERIC, deposit_clp NUMERIC, tenant_fee_clp NUMERIC,
  owner_commission_rate NUMERIC, owner_commission_reason TEXT, owner_commission_clp NUMERIC,
  discount_clp NUMERIC, cancellation_fee_clp NUMERIC, platform_revenue_clp NUMERIC,
  owner_net_clp NUMERIC, refunded_clp NUMERIC, refund_pending_clp NUMERIC, payout_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH pay AS (
    SELECT DISTINCT ON (p.reservation_id)
      p.reservation_id,
      COALESCE(p.committed_at, p.transaction_date, p.created_at) AS paid_at,
      p.amount_clp,
      p.refunded_amount_clp
    FROM public.payments p
    WHERE p.status IN ('authorized', 'refunded', 'partially_refunded')
    ORDER BY p.reservation_id, p.created_at DESC
  ), base AS (
    SELECT r.*, pay.paid_at AS charged_at, pay.amount_clp AS collected, pay.refunded_amount_clp AS refunded,
           (r.status IN ('pending', 'confirmed', 'completed')) AS live
    FROM public.reservations r
    JOIN pay ON pay.reservation_id = r.id
    WHERE (pay.paid_at AT TIME ZONE 'America/Santiago')::date BETWEEN p_from AND p_to
  )
  SELECT
    b.id, b.charged_at, b.space_id, b.space_title, b.tenant_name, b.owner_id, b.owner_name,
    b.status, b.payment_status, b.collected, b.subtotal_clp, b.security_deposit_clp,
    CASE WHEN b.live THEN b.platform_fee_clp ELSE 0 END,
    b.owner_commission_rate, b.owner_commission_reason,
    CASE WHEN b.live THEN b.owner_commission_clp ELSE 0 END,
    CASE WHEN b.live THEN b.discount_clp ELSE 0 END,
    CASE WHEN b.live THEN 0 ELSE GREATEST(b.total_clp - COALESCE(b.refund_amount_clp, b.total_clp), 0) END,
    CASE WHEN b.live THEN b.platform_fee_clp + b.owner_commission_clp - b.discount_clp
         ELSE GREATEST(b.total_clp - COALESCE(b.refund_amount_clp, b.total_clp), 0) END,
    CASE WHEN b.status IN ('confirmed', 'completed') THEN b.subtotal_clp - b.owner_commission_clp ELSE 0 END,
    COALESCE(b.refunded, 0),
    CASE WHEN b.payment_status = 'refund_pending' THEN COALESCE(b.refund_amount_clp, 0) ELSE 0 END,
    (SELECT op.status FROM public.owner_payouts op WHERE op.reservation_id = b.id)
  FROM base b
$$;
REVOKE ALL ON FUNCTION public.platform_ledger(DATE, DATE) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_finance_report(p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_totals JSONB;
  v_monthly JSONB;
  v_spaces JSONB;
  v_rows JSONB;
  v_payouts JSONB;
  v_settings JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Rango de fechas inválido';
  END IF;

  SELECT jsonb_build_object(
    'reservations', count(*),
    'collectedClp', COALESCE(sum(collected_clp), 0),
    'refundedClp', COALESCE(sum(refunded_clp), 0),
    'refundPendingClp', COALESCE(sum(refund_pending_clp), 0),
    'tenantFeesClp', COALESCE(sum(tenant_fee_clp) FILTER (WHERE status <> 'pending'), 0),
    'ownerCommissionsClp', COALESCE(sum(owner_commission_clp) FILTER (WHERE status <> 'pending'), 0),
    'discountsClp', COALESCE(sum(discount_clp) FILTER (WHERE status <> 'pending'), 0),
    'cancellationFeesClp', COALESCE(sum(cancellation_fee_clp), 0),
    'platformRevenueClp', COALESCE(sum(platform_revenue_clp) FILTER (WHERE status <> 'pending'), 0),
    'pendingRevenueClp', COALESCE(sum(platform_revenue_clp) FILTER (WHERE status = 'pending'), 0),
    'ownerNetClp', COALESCE(sum(owner_net_clp), 0),
    'gmvClp', COALESCE(sum(subtotal_clp) FILTER (WHERE status IN ('confirmed', 'completed')), 0),
    'depositsHeldClp', COALESCE(sum(deposit_clp) FILTER (
       WHERE status IN ('pending', 'confirmed') AND payment_status = 'paid'), 0),
    'cancelledCount', count(*) FILTER (WHERE status IN ('cancelled', 'rejected')),
    'completedCount', count(*) FILTER (WHERE status = 'completed')
  ) INTO v_totals
  FROM public.platform_ledger(p_from, p_to);

  SELECT COALESCE(jsonb_agg(m ORDER BY m->>'month'), '[]'::jsonb) INTO v_monthly
  FROM (
    SELECT jsonb_build_object(
      'month', to_char(paid_at AT TIME ZONE 'America/Santiago', 'YYYY-MM'),
      'tenantFeesClp', COALESCE(sum(tenant_fee_clp) FILTER (WHERE status <> 'pending'), 0),
      'ownerCommissionsClp', COALESCE(sum(owner_commission_clp) FILTER (WHERE status <> 'pending'), 0),
      'discountsClp', COALESCE(sum(discount_clp) FILTER (WHERE status <> 'pending'), 0),
      'cancellationFeesClp', COALESCE(sum(cancellation_fee_clp), 0),
      'platformRevenueClp', COALESCE(sum(platform_revenue_clp) FILTER (WHERE status <> 'pending'), 0),
      'collectedClp', COALESCE(sum(collected_clp), 0),
      'reservations', count(*)
    ) AS m
    FROM public.platform_ledger(p_from, p_to)
    GROUP BY to_char(paid_at AT TIME ZONE 'America/Santiago', 'YYYY-MM')
  ) s;

  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'platformRevenueClp')::numeric DESC), '[]'::jsonb) INTO v_spaces
  FROM (
    SELECT jsonb_build_object(
      'spaceId', space_id, 'spaceTitle', max(space_title), 'ownerName', max(owner_name),
      'reservations', count(*),
      'platformRevenueClp', COALESCE(sum(platform_revenue_clp) FILTER (WHERE status <> 'pending'), 0),
      'ownerNetClp', COALESCE(sum(owner_net_clp), 0)
    ) AS x
    FROM public.platform_ledger(p_from, p_to)
    GROUP BY space_id
    ORDER BY COALESCE(sum(platform_revenue_clp) FILTER (WHERE status <> 'pending'), 0) DESC
    LIMIT 10
  ) s;

  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.paid_at DESC), '[]'::jsonb) INTO v_rows
  FROM (SELECT * FROM public.platform_ledger(p_from, p_to) ORDER BY paid_at DESC LIMIT 500) l;

  SELECT jsonb_build_object(
    'pendingCount', count(*) FILTER (WHERE status IN ('pending', 'on_hold')),
    'pendingClp', COALESCE(sum(amount_clp) FILTER (WHERE status IN ('pending', 'on_hold')), 0),
    'paidClp', COALESCE(sum(amount_clp) FILTER (WHERE status = 'paid'), 0),
    'items', COALESCE(jsonb_agg(jsonb_build_object(
        'id', op.id, 'reservationId', op.reservation_id, 'ownerId', op.owner_id,
        'ownerName', pr.full_name, 'grossClp', op.gross_clp,
        'ownerCommissionClp', op.owner_commission_clp, 'amountClp', op.amount_clp,
        'status', op.status, 'transferReference', op.transfer_reference,
        'paidAt', op.paid_at, 'createdAt', op.created_at)
      ORDER BY op.created_at DESC) FILTER (WHERE op.status IN ('pending', 'on_hold')), '[]'::jsonb)
  ) INTO v_payouts
  FROM public.owner_payouts op
  LEFT JOIN public.profiles pr ON pr.id = op.owner_id;

  SELECT to_jsonb(s) - 'id' INTO v_settings FROM public.platform_settings s WHERE id;

  RETURN jsonb_build_object('from', p_from, 'to', p_to, 'totals', v_totals, 'monthly', v_monthly,
                            'topSpaces', v_spaces, 'rows', v_rows, 'payouts', v_payouts,
                            'settings', v_settings, 'generatedAt', now());
END;
$$;

-- ---------- Bitácora de auditoría encadenada (a prueba de alteraciones) ----------
-- Cada registro guarda el SHA-256 de su contenido más el hash del registro
-- anterior. Si alguien modifica o borra una fila directamente en la base, la
-- cadena deja de cuadrar y admin_verify_audit_chain() lo detecta.
CREATE SEQUENCE IF NOT EXISTS public.audit_logs_seq;
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS seq BIGINT,
  ADD COLUMN IF NOT EXISTS prev_hash TEXT,
  ADD COLUMN IF NOT EXISTS row_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_logs_seq ON public.audit_logs (seq);

CREATE OR REPLACE FUNCTION public.audit_row_hash(
  p_prev TEXT, p_id TEXT, p_seq BIGINT, p_ts TIMESTAMPTZ, p_action TEXT, p_user_id TEXT,
  p_user_email TEXT, p_user_role TEXT, p_severity TEXT, p_ip TEXT, p_details JSONB
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    COALESCE(p_prev, 'GENESIS'), p_id, p_seq::text,
    to_char(p_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    p_action, p_user_id, p_user_email, p_user_role, p_severity,
    COALESCE(p_ip, ''), COALESCE(p_details, '{}'::jsonb)::text), 'UTF8')), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.audit_logs_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev TEXT;
BEGIN
  -- La fecha la fija la base. La IP la informa el backend (p_ip de write_audit)
  -- o se toma de las cabeceras del request que originó el evento.
  NEW.ip := COALESCE(NEW.ip, public.request_ip(), 'no disponible');
  NEW.user_agent := COALESCE(NEW.user_agent, public.request_user_agent());
  NEW.timestamp := now();
  -- Encadenamiento: un registro a la vez, en orden.
  PERFORM pg_advisory_xact_lock(hashtext('spotly_audit_chain'));
  NEW.seq := nextval('public.audit_logs_seq');
  SELECT row_hash INTO v_prev FROM public.audit_logs WHERE seq IS NOT NULL ORDER BY seq DESC LIMIT 1;
  NEW.prev_hash := v_prev;
  NEW.row_hash := public.audit_row_hash(v_prev, NEW.id, NEW.seq, NEW.timestamp, NEW.action, NEW.user_id,
                                        NEW.user_email, NEW.user_role, NEW.severity, NEW.ip, NEW.details);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_verify_audit_chain()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r RECORD;
  v_prev TEXT := NULL;
  v_count BIGINT := 0;
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores';
  END IF;
  FOR r IN SELECT * FROM public.audit_logs WHERE seq IS NOT NULL ORDER BY seq LOOP
    v_count := v_count + 1;
    IF r.prev_hash IS DISTINCT FROM v_prev
       OR r.row_hash IS DISTINCT FROM public.audit_row_hash(v_prev, r.id, r.seq, r.timestamp, r.action,
            r.user_id, r.user_email, r.user_role, r.severity, r.ip, r.details) THEN
      v_result := jsonb_build_object('ok', false, 'checked', v_count, 'brokenSeq', r.seq,
                                     'brokenId', r.id, 'brokenAt', r.timestamp, 'action', r.action);
      PERFORM public.write_audit('AUDIT_CHAIN_BROKEN', 'critical', auth.uid()::text, v_result);
      RETURN v_result;
    END IF;
    v_prev := r.row_hash;
  END LOOP;
  v_result := jsonb_build_object('ok', true, 'checked', v_count, 'lastHash', v_prev, 'verifiedAt', now());
  PERFORM public.write_audit('AUDIT_CHAIN_VERIFIED', 'security', auth.uid()::text, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_category(p_action TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_action LIKE 'PAYMENT\_%' OR p_action LIKE 'PAYOUT\_%' OR p_action LIKE 'REFUND\_%'
      OR p_action LIKE 'WALLET\_%' OR p_action LIKE 'DISCOUNT\_%' THEN 'pagos'
    WHEN p_action LIKE 'RESERVATION\_%' OR p_action LIKE 'CONTRACT\_%' OR p_action LIKE 'VISIT\_%' THEN 'reservas'
    WHEN p_action LIKE 'LOGIN\_%' OR p_action LIKE 'USER\_LOGGED\_%' OR p_action LIKE 'PASSWORD\_%'
      OR p_action LIKE 'SIGNUP\_%' OR p_action LIKE 'USER\_REGISTERED%' OR p_action = 'EMAIL_VERIFIED'
      OR p_action = 'ACCOUNT_TEMPORARILY_LOCKED' THEN 'accesos'
    WHEN p_action LIKE 'KYC\_%' THEN 'identidad'
    WHEN p_action LIKE 'SPACE\_%' THEN 'espacios'
    WHEN p_action LIKE 'DISPUTE\_%' OR p_action LIKE 'REPORT\_%' THEN 'reclamos'
    WHEN p_action LIKE 'ADMIN\_%' OR p_action = 'ROLE_CHANGED' OR p_action LIKE 'PLATFORM\_%'
      OR p_action LIKE 'AUDIT\_%' THEN 'administracion'
    ELSE 'otros'
  END;
$$;

CREATE OR REPLACE FUNCTION public.admin_audit_search(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_query TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from TIMESTAMPTZ := COALESCE(p_from, now() - interval '30 days');
  v_to TIMESTAMPTZ := COALESCE(p_to, now());
  v_q TEXT := NULLIF(trim(COALESCE(p_query, '')), '');
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_total BIGINT;
  v_rows JSONB;
  v_by_sev JSONB;
  v_by_cat JSONB;
  v_last24 JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _audit_hits ON COMMIT DROP AS
    SELECT a.* FROM public.audit_logs a WHERE false;
  TRUNCATE _audit_hits;
  INSERT INTO _audit_hits
  SELECT a.* FROM public.audit_logs a
  WHERE a.timestamp >= v_from AND a.timestamp <= v_to
    AND (p_severity IS NULL OR p_severity = '' OR a.severity = p_severity)
    AND (p_category IS NULL OR p_category = '' OR public.audit_category(a.action) = p_category)
    AND (v_q IS NULL
         OR a.action ILIKE '%' || v_q || '%'
         OR a.user_email ILIKE '%' || v_q || '%'
         OR a.user_id = v_q
         OR a.ip ILIKE '%' || v_q || '%'
         OR a.details::text ILIKE '%' || v_q || '%');

  SELECT count(*) INTO v_total FROM _audit_hits;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', h.id, 'seq', h.seq, 'timestamp', h.timestamp, 'action', h.action,
      'category', public.audit_category(h.action), 'severity', h.severity,
      'userId', h.user_id, 'userEmail', h.user_email, 'userRole', h.user_role,
      'ip', h.ip, 'userAgent', h.user_agent, 'details', h.details,
      'rowHash', h.row_hash, 'prevHash', h.prev_hash)
    ORDER BY h.timestamp DESC, h.seq DESC), '[]'::jsonb) INTO v_rows
  FROM (SELECT * FROM _audit_hits ORDER BY timestamp DESC, seq DESC NULLS LAST LIMIT v_limit OFFSET v_offset) h;

  SELECT COALESCE(jsonb_object_agg(severity, n), '{}'::jsonb) INTO v_by_sev
  FROM (SELECT severity, count(*) AS n FROM _audit_hits GROUP BY severity) s;
  SELECT COALESCE(jsonb_object_agg(cat, n), '{}'::jsonb) INTO v_by_cat
  FROM (SELECT public.audit_category(action) AS cat, count(*) AS n FROM _audit_hits GROUP BY 1) s;

  SELECT jsonb_build_object(
    'events', count(*),
    'critical', count(*) FILTER (WHERE severity = 'critical'),
    'failedLogins', count(*) FILTER (WHERE action = 'LOGIN_FAILED'),
    'lockouts', count(*) FILTER (WHERE action = 'ACCOUNT_TEMPORARILY_LOCKED'),
    'adminActions', count(*) FILTER (WHERE public.audit_category(action) = 'administracion'),
    'payments', count(*) FILTER (WHERE action = 'PAYMENT_AUTHORIZED')
  ) INTO v_last24
  FROM public.audit_logs WHERE timestamp >= now() - interval '24 hours';

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows, 'bySeverity', v_by_sev,
                            'byCategory', v_by_cat, 'last24h', v_last24,
                            'from', v_from, 'to', v_to, 'limit', v_limit, 'offset', v_offset);
END;
$$;

-- ---------- Permisos de las funciones nuevas ----------
REVOKE ALL ON FUNCTION public.owner_commission_terms(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_finished_reservations(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_my_finished_reservations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_my_finished_reservations() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_mark_payout_paid(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(TEXT, TEXT) TO authenticated;          -- valida is_admin()
REVOKE ALL ON FUNCTION public.admin_update_platform_settings(NUMERIC, NUMERIC, DATE, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_platform_settings(NUMERIC, NUMERIC, DATE, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_finance_report(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_finance_report(DATE, DATE) TO authenticated;            -- valida is_admin()
REVOKE ALL ON FUNCTION public.admin_verify_audit_chain() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_audit_chain() TO authenticated;                  -- valida is_admin()
REVOKE ALL ON FUNCTION public.admin_audit_search(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_audit_search(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;


-- Liquidación con comisión y finalización automática en el mantenimiento.
CREATE OR REPLACE FUNCTION public.reservation_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status_text TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('RESERVATION_CREATED', 'info', NEW.tenant_id::text,
      jsonb_build_object('reservationId', NEW.id, 'spaceId', NEW.space_id, 'totalClp', NEW.total_clp,
                         'subtotalClp', NEW.subtotal_clp, 'tenantFeeClp', NEW.platform_fee_clp,
                         'ownerCommissionRate', NEW.owner_commission_rate,
                         'ownerCommissionClp', NEW.owner_commission_clp,
                         'ownerCommissionReason', NEW.owner_commission_reason,
                         'discountClp', NEW.discount_clp, 'period', NEW.booking_period::text));
    RETURN NEW;
  END IF;

  IF NEW.discount_code IS NOT NULL AND OLD.payment_status = 'pending' AND NEW.payment_status = 'failed' THEN
    UPDATE public.discount_codes
    SET used_count = GREATEST(used_count - 1, 0)
    WHERE code = NEW.discount_code;
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

    -- Reserva finalizada y pagada: queda pendiente la liquidación al propietario.
    -- Recibe el arriendo menos su comisión; el descuento lo absorbe Spotly.
    -- Con un reclamo abierto la liquidación queda retenida.
    IF NEW.status = 'completed' AND NEW.payment_status IN ('paid', 'partially_refunded', 'refund_pending') THEN
      INSERT INTO public.owner_payouts (reservation_id, owner_id, gross_clp, platform_fee_clp, discount_clp,
                                        owner_commission_clp, amount_clp, status)
      VALUES (NEW.id, NEW.owner_id, NEW.subtotal_clp, NEW.platform_fee_clp, NEW.discount_clp,
              NEW.owner_commission_clp, GREATEST(NEW.subtotal_clp - NEW.owner_commission_clp, 0),
              CASE WHEN COALESCE(NEW.dispute_status, 'none') IN ('opened', 'in_review') THEN 'on_hold' ELSE 'pending' END)
      ON CONFLICT (reservation_id) DO NOTHING;
    END IF;

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

CREATE OR REPLACE FUNCTION public.run_maintenance()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.release_expired_payment_holds(NULL);
  PERFORM public.expire_unanswered_requests();
  PERFORM public.complete_finished_reservations(NULL);
  PERFORM public.purge_old_login_attempts();
  PERFORM public.purge_unconfirmed_accounts();
  DELETE FROM public.space_views WHERE created_at < now() - interval '400 days';
  DELETE FROM public.notifications WHERE read AND created_at < now() - interval '180 days';
END;
$$;

-- Encadena los registros de auditoría que ya existían (en orden cronológico).
ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_no_update_delete;
DO $$
DECLARE
  r RECORD;
  v_prev TEXT;
  v_seq BIGINT;
BEGIN
  SELECT row_hash INTO v_prev FROM public.audit_logs WHERE seq IS NOT NULL ORDER BY seq DESC LIMIT 1;
  FOR r IN SELECT * FROM public.audit_logs WHERE seq IS NULL ORDER BY timestamp, id LOOP
    v_seq := nextval('public.audit_logs_seq');
    UPDATE public.audit_logs
    SET seq = v_seq,
        prev_hash = v_prev,
        row_hash = public.audit_row_hash(v_prev, r.id, v_seq, r.timestamp, r.action, r.user_id,
                                         r.user_email, r.user_role, r.severity, r.ip, r.details)
    WHERE id = r.id
    RETURNING row_hash INTO v_prev;
  END LOOP;
END $$;
ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_no_update_delete;

GRANT SELECT ON public.platform_settings TO anon, authenticated;

COMMIT;

-- Finaliza ahora las reservas que ya terminaron (genera sus liquidaciones).
SELECT public.complete_finished_reservations(NULL) AS reservas_finalizadas;

