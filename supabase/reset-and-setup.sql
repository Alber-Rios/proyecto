-- SPOTLY: script ÚNICO para reiniciar y crear el esquema completo de la base de datos.
-- Incluye todo: tablas base, seguridad (RLS), Storage y los módulos de cumplimiento
-- del informe (anti-sobreventa, pagos Webpay, contratos SHA-256, auditoría,
-- valoraciones, favoritos, notificaciones, KYC, reportes, descuentos y KPI).
--
-- ATENCIÓN: destructivo. Borra los datos de las tablas Spotly indicadas abajo.
-- Conserva auth.users, buckets y archivos de Storage. Se recrean perfiles
-- desde auth.users para que las cuentas existentes puedan seguir ingresando.
-- Revisar y guardar respaldo antes de ejecutar en Supabase SQL Editor.
-- Ejecutar este archivo completo en una sola ejecución.

BEGIN;

-- Tablas de Spotly del esquema v2, en orden inverso de dependencias.
-- CASCADE quita también vistas/constraints dependientes dentro de public.
DROP TABLE IF EXISTS public.space_views CASCADE;
DROP TABLE IF EXISTS public.user_reports CASCADE;
DROP TABLE IF EXISTS public.reviews CASCADE;
DROP TABLE IF EXISTS public.favorites CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.discount_codes CASCADE;
DROP TABLE IF EXISTS public.login_attempts CASCADE;
DROP TABLE IF EXISTS public.kyc_verifications CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.saved_cards CASCADE;
DROP TABLE IF EXISTS public.visit_requests CASCADE;
DROP TABLE IF EXISTS public.disputes CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.contracts CASCADE;
DROP TABLE IF EXISTS public.reservations CASCADE;
DROP TABLE IF EXISTS public.spaces CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ==============================================================================
-- SPOTLY CHILE - SCHEMA V2 (MEJORADO)
-- ==============================================================================
-- Mejoras respecto a schema original:
--   1. Foreign Keys faltantes en disputes y visit_requests
--   2. Índices en columnas de búsqueda frecuente
--   3. Políticas de Storage más estrictas (por carpeta de usuario)
--   4. Generación automática de IDs (TEXT) si no se envían
--   5. Políticas de INSERT más seguras en contracts
--   6. Comentarios y consistencia de tipos
--
-- Copia y pega este contenido en el SQL Editor de Supabase.
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- HELPER: Generar ID legible tipo "spc_xxxx", "res_xxxx", etc.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.generate_id(prefix TEXT DEFAULT 'id')
RETURNS TEXT AS $$
BEGIN
  RETURN prefix || '_' || replace(gen_random_uuid()::text, '-', '');
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 2. TABLA: profiles
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    first_names TEXT,
    surnames TEXT,
    email TEXT NOT NULL UNIQUE,
    rut TEXT,
    phone TEXT,
    avatar_url TEXT,
    gender TEXT CHECK (gender IN ('masculino', 'femenino', 'no_binario', 'otro', 'prefiero_no_decir')),
    birth_date DATE CHECK (birth_date IS NULL OR birth_date <= (CURRENT_DATE - INTERVAL '18 years')::DATE),
    role TEXT NOT NULL DEFAULT 'tenant' CHECK (role IN ('tenant', 'owner', 'admin')),
    owner_terms_accepted BOOLEAN NOT NULL DEFAULT false,
    owner_application_date TIMESTAMPTZ,
    verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified', 'in_progress', 'pending_review', 'verified', 'rejected')),
    kyc_rejection_reason TEXT,
    kyc_data JSONB DEFAULT '{}'::jsonb,
    commune TEXT,
    city TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_names TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS surnames TEXT;

COMMENT ON TABLE public.profiles IS 'Perfiles de usuarios sincronizados con auth.users';

-- ==============================================================================
-- 3. TABLA: spaces
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.spaces (
    id TEXT PRIMARY KEY DEFAULT public.generate_id('spc'),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    owner_name TEXT NOT NULL,
    owner_rut TEXT NOT NULL,
    owner_verified BOOLEAN NOT NULL DEFAULT false,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('office', 'cowork', 'event', 'studio', 'warehouse', 'retail')),
    space_environment TEXT NOT NULL DEFAULT 'cerrado' CHECK (space_environment IN ('abierto', 'cerrado')),
    rental_modality TEXT NOT NULL DEFAULT 'por_dia' CHECK (rental_modality IN ('por_hora', 'por_dia', 'mensual', 'abierto')),
    enabled_modalities TEXT[] DEFAULT ARRAY['por_dia']::TEXT[],
    price_unit TEXT DEFAULT 'day' CHECK (price_unit IN ('hour', 'day', 'month')),
    commune TEXT NOT NULL,
    region TEXT NOT NULL,
    address TEXT NOT NULL,
    price_per_day NUMERIC NOT NULL,
    price_per_hour NUMERIC,
    price_per_month NUMERIC,
    capacity INTEGER NOT NULL DEFAULT 1,
    surface_m2 NUMERIC NOT NULL DEFAULT 1,
    amenities TEXT[] DEFAULT '{}'::TEXT[],
    rules TEXT[] DEFAULT '{}'::TEXT[],
    opening_hours TEXT,
    security_deposit NUMERIC NOT NULL DEFAULT 0,
    images TEXT[] DEFAULT '{}'::TEXT[],
    is_verified BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_approval', 'paused')),
    rating NUMERIC NOT NULL DEFAULT 5.0,
    reviews_count INTEGER NOT NULL DEFAULT 0,
    min_booking_days INTEGER DEFAULT 1,
    min_booking_hours INTEGER DEFAULT 1,
    instant_booking BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.spaces IS 'Propiedades, oficinas, salas de eventos y recintos';

-- ==============================================================================
-- 4. TABLA: reservations
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.reservations (
    id TEXT PRIMARY KEY DEFAULT public.generate_id('res'),
    space_id TEXT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
    space_title TEXT NOT NULL,
    space_address TEXT,
    space_image TEXT,
    space_category TEXT,
    space_environment TEXT,
    tenant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    tenant_name TEXT NOT NULL,
    tenant_email TEXT NOT NULL,
    tenant_phone TEXT,
    tenant_rut TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    owner_name TEXT NOT NULL,
    owner_rut TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days INTEGER NOT NULL,
    daily_rate_clp NUMERIC NOT NULL,
    rental_modality TEXT DEFAULT 'por_dia',
    duration_units NUMERIC,
    price_unit TEXT DEFAULT 'day',
    hour_start INTEGER,
    hour_end INTEGER,
    time_slot_string TEXT,
    rental_month TEXT,
    subtotal_clp NUMERIC NOT NULL,
    platform_fee_clp NUMERIC NOT NULL,
    security_deposit_clp NUMERIC NOT NULL,
    total_clp NUMERIC NOT NULL,
    intended_use TEXT NOT NULL,
    payment_simulation JSONB,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'cancelled', 'rejected', 'completed')),
    digital_contract_id TEXT,
    dispute_status TEXT DEFAULT 'none'
        CHECK (dispute_status IN ('none', 'opened', 'in_review', 'resolved')),
    dispute_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reservations_dates_check CHECK (end_date >= start_date)
);

COMMENT ON TABLE public.reservations IS 'Reservas y contratos de arriendo en custodia';

-- ==============================================================================
-- 5. TABLA: contracts
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.contracts (
    id TEXT PRIMARY KEY DEFAULT public.generate_id('ctr'),
    reservation_id TEXT NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
    space_title TEXT NOT NULL,
    space_address TEXT NOT NULL,
    tenant_name TEXT NOT NULL,
    tenant_rut TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    owner_rut TEXT NOT NULL,
    total_clp NUMERIC NOT NULL,
    guarantee_deposit_clp NUMERIC NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    clauses TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    contract_hash TEXT NOT NULL,
    price_unit TEXT,
    rental_modality TEXT,
    signature_image TEXT,
    signature_type TEXT DEFAULT 'digital_canvas',
    tenant_signature JSONB,
    pdf_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contracts IS 'Contratos digitales con sello criptográfico y firma';

-- ==============================================================================
-- 6. TABLA: audit_logs
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY DEFAULT public.generate_id('aud'),
    action TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    user_role TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'security', 'critical')),
    details JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.audit_logs IS 'Bitácora inmutable de auditoría y seguridad';

-- ==============================================================================
-- 7. TABLA: disputes  (con FKs)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.disputes (
    id TEXT PRIMARY KEY DEFAULT public.generate_id('dsp'),
    reservation_id TEXT REFERENCES public.reservations(id) ON DELETE SET NULL,
    space_id TEXT REFERENCES public.spaces(id) ON DELETE SET NULL,
    space_title TEXT NOT NULL,
    tenant_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    tenant_name TEXT NOT NULL,
    tenant_rut TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    owner_rut TEXT NOT NULL,
    amount_clp NUMERIC NOT NULL,
    subtotal_clp NUMERIC,
    security_deposit_clp NUMERIC,
    platform_fee_clp NUMERIC,
    problem_category TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'investigating', 'resolved_refund', 'resolved_owner')),
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.disputes IS 'Gestión y mediación de reclamos y disputas';

-- ==============================================================================
-- 8. TABLA: visit_requests  (con FKs)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.visit_requests (
    id TEXT PRIMARY KEY DEFAULT public.generate_id('vis'),
    space_id TEXT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
    space_title TEXT NOT NULL,
    space_address TEXT,
    space_image TEXT,
    tenant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    tenant_name TEXT NOT NULL,
    tenant_email TEXT NOT NULL,
    tenant_phone TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    owner_name TEXT NOT NULL,
    owner_rut TEXT,
    visit_date DATE NOT NULL,
    visit_time_slot TEXT NOT NULL,
    modality TEXT NOT NULL DEFAULT 'presencial' CHECK (modality IN ('presencial', 'virtual')),
    attendees_count INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.visit_requests IS 'Agendamiento de visitas presenciales o virtuales';

-- ==============================================================================
-- ÍNDICES (rendimiento)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_spaces_owner_id        ON public.spaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_spaces_status          ON public.spaces(status);
CREATE INDEX IF NOT EXISTS idx_spaces_commune         ON public.spaces(commune);
CREATE INDEX IF NOT EXISTS idx_spaces_category        ON public.spaces(category);
CREATE INDEX IF NOT EXISTS idx_spaces_created_at      ON public.spaces(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reservations_tenant_id ON public.reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_owner_id  ON public.reservations(owner_id);
CREATE INDEX IF NOT EXISTS idx_reservations_space_id  ON public.reservations(space_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status    ON public.reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_dates     ON public.reservations(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_contracts_reservation  ON public.contracts(reservation_id);

CREATE INDEX IF NOT EXISTS idx_disputes_reservation   ON public.disputes(reservation_id);
CREATE INDEX IF NOT EXISTS idx_disputes_tenant        ON public.disputes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status        ON public.disputes(status);

CREATE INDEX IF NOT EXISTS idx_visit_requests_space   ON public.visit_requests(space_id);
CREATE INDEX IF NOT EXISTS idx_visit_requests_tenant  ON public.visit_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_visit_requests_owner   ON public.visit_requests(owner_id);
CREATE INDEX IF NOT EXISTS idx_visit_requests_date    ON public.visit_requests(visit_date);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user        ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp   ON public.audit_logs(timestamp DESC);

-- ==============================================================================
-- DISPARADORES (TRIGGERS)
-- ==============================================================================

-- Sincronización de perfiles y auditoría para altas en Supabase Auth.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_role TEXT;
BEGIN
  -- El registro público solo puede crear arrendatarios o propietarios,
  -- nunca administradores. Los admin se asignan manualmente desde SQL Editor.
  profile_role := CASE
    WHEN NEW.raw_user_meta_data->>'role' = 'owner' THEN 'owner'
    ELSE 'tenant'
  END;

  INSERT INTO public.profiles (
    id,
    full_name,
    first_names,
    surnames,
    email,
    rut,
    phone,
    gender,
    birth_date,
    role,
    owner_terms_accepted,
    verification_status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Usuario Spotly'),
    COALESCE(NEW.raw_user_meta_data->>'first_names', ''),
    COALESCE(NEW.raw_user_meta_data->>'surnames', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'rut', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'gender', 'prefiero_no_decir'),
    CASE
      WHEN NEW.raw_user_meta_data->>'birth_date' IS NOT NULL
           AND NEW.raw_user_meta_data->>'birth_date' <> ''
      THEN (NEW.raw_user_meta_data->>'birth_date')::DATE
      ELSE NULL
    END,
    profile_role,
    COALESCE((NEW.raw_user_meta_data->>'owner_terms_accepted')::boolean, false),
    'unverified',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    first_names = EXCLUDED.first_names,
    surnames = EXCLUDED.surnames,
    email = EXCLUDED.email,
    rut = EXCLUDED.rut,
    phone = EXCLUDED.phone,
    gender = EXCLUDED.gender,
    birth_date = EXCLUDED.birth_date,
    updated_at = now();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      action, user_id, user_email, user_role, timestamp, severity, details
    ) VALUES (
      'USER_REGISTERED_SUPABASE', NEW.id::text, COALESCE(NEW.email, ''),
      profile_role, now(), 'security',
      jsonb_build_object('ownerTermsAccepted', COALESCE((NEW.raw_user_meta_data->>'owner_terms_accepted')::boolean, false))
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF raw_user_meta_data, email ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Recupera los perfiles vinculados a cuentas Auth que existían antes del reset.
INSERT INTO public.profiles (
  id, full_name, first_names, surnames, email, rut, phone, gender, birth_date,
  role, owner_terms_accepted, verification_status
)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', 'Usuario Spotly'),
  COALESCE(u.raw_user_meta_data->>'first_names', ''),
  COALESCE(u.raw_user_meta_data->>'surnames', ''),
  COALESCE(u.email, ''),
  COALESCE(u.raw_user_meta_data->>'rut', ''),
  COALESCE(u.raw_user_meta_data->>'phone', ''),
  COALESCE(u.raw_user_meta_data->>'gender', 'prefiero_no_decir'),
  NULLIF(u.raw_user_meta_data->>'birth_date', '')::date,
  CASE WHEN u.raw_user_meta_data->>'role' = 'owner' THEN 'owner' ELSE 'tenant' END,
  COALESCE((u.raw_user_meta_data->>'owner_terms_accepted')::boolean, false),
  'unverified'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Evita que un usuario se eleve a admin o altere por sí mismo su KYC.
-- La transición tenant -> owner requiere aceptación registrada de términos.
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  valid_manual_submission BOOLEAN;
BEGIN
  -- SQL Editor/service role (sin auth.uid) es el canal administrativo confiable.
  -- Las llamadas normales autenticadas deben pasar además is_admin().
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.kyc_rejection_reason IS DISTINCT FROM OLD.kyc_rejection_reason
     OR NEW.kyc_data IS DISTINCT FROM OLD.kyc_data THEN
    valid_manual_submission :=
      NEW.verification_status = 'pending_review'
      AND NEW.kyc_data->>'consentGiven' = 'true'
      AND NEW.kyc_data->>'idFrontCaptured' = 'true'
      AND NEW.kyc_data->>'idBackCaptured' = 'true'
      AND NEW.kyc_data->>'photoCaptured' = 'true'
      AND NEW.kyc_data->>'criminalRecordSubmitted' = 'true'
      AND NULLIF(NEW.kyc_data->>'idFrontUrl', '') IS NOT NULL
      AND NULLIF(NEW.kyc_data->>'idBackUrl', '') IS NOT NULL
      AND NULLIF(NEW.kyc_data->>'photoUrl', '') IS NOT NULL
      AND NULLIF(NEW.kyc_data->>'criminalRecordUrl', '') IS NOT NULL
      AND NULLIF(NEW.kyc_data->>'submittedAt', '') IS NOT NULL;

    IF NOT COALESCE(valid_manual_submission, false) THEN
      RAISE EXCEPTION 'Solo un administrador puede modificar el estado o los datos KYC, excepto al enviar una solicitud completa para revisión manual';
    END IF;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT (
    OLD.role = 'tenant' AND NEW.role = 'owner'
    AND NEW.owner_terms_accepted IS TRUE
    AND NEW.owner_application_date IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cambio de rol no autorizado';
  END IF;

  IF NEW.owner_terms_accepted IS DISTINCT FROM OLD.owner_terms_accepted
     AND NEW.owner_terms_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'La aceptación de términos no se puede retirar';
  END IF;

  RETURN NEW;
END;
$$;

-- updated_at automático
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS guard_profiles_privileged_fields ON public.profiles;
CREATE TRIGGER guard_profiles_privileged_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.guard_profile_privileged_fields();
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_spaces_updated_at ON public.spaces;
CREATE TRIGGER set_spaces_updated_at
  BEFORE UPDATE ON public.spaces
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_reservations_updated_at ON public.reservations;
CREATE TRIGGER set_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_requests ENABLE ROW LEVEL SECURITY;

-- Helper admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ------------------------------------------------------------------------------
-- RLS: PROFILES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lectura pública de perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Lectura de perfil propio o administrador" ON public.profiles;
CREATE POLICY "Lectura de perfil propio o administrador"
  ON public.profiles FOR SELECT
  USING ((SELECT auth.uid()) = id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "Actualización de perfil propio o admin" ON public.profiles;
CREATE POLICY "Actualización de perfil propio o admin"
  ON public.profiles FOR UPDATE
  USING ((SELECT auth.uid()) = id OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT auth.uid()) = id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "Inserción de perfil propio" ON public.profiles;
-- El alta de perfiles la hace el trigger SECURITY DEFINER desde auth.users.

-- ------------------------------------------------------------------------------
-- RLS: SPACES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lectura pública de espacios activos" ON public.spaces;
CREATE POLICY "Lectura pública de espacios activos"
  ON public.spaces FOR SELECT
  USING (status = 'active' OR (SELECT auth.uid()) = owner_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "Propietarios pueden crear espacios" ON public.spaces;
CREATE POLICY "Propietarios pueden crear espacios"
  ON public.spaces FOR INSERT
  WITH CHECK (
    (SELECT public.is_admin()) OR (
      (SELECT auth.uid()) = owner_id AND EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'owner'
      )
    )
  );

DROP POLICY IF EXISTS "Propietarios pueden actualizar sus espacios" ON public.spaces;
CREATE POLICY "Propietarios pueden actualizar sus espacios"
  ON public.spaces FOR UPDATE
  USING ((SELECT auth.uid()) = owner_id OR (SELECT public.is_admin()))
  WITH CHECK (
    (SELECT public.is_admin()) OR (
      (SELECT auth.uid()) = owner_id AND EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'owner'
      )
    )
  );

DROP POLICY IF EXISTS "Propietarios pueden eliminar sus espacios" ON public.spaces;
CREATE POLICY "Propietarios pueden eliminar sus espacios"
  ON public.spaces FOR DELETE
  USING ((SELECT auth.uid()) = owner_id OR (SELECT public.is_admin()));

-- ------------------------------------------------------------------------------
-- RLS: RESERVATIONS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Partes de la reserva o admin pueden verla" ON public.reservations;
CREATE POLICY "Partes de la reserva o admin pueden verla"
  ON public.reservations FOR SELECT
  USING ((SELECT auth.uid()) = tenant_id OR (SELECT auth.uid()) = owner_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "Inquilinos pueden solicitar reservas" ON public.reservations;
CREATE POLICY "Inquilinos pueden solicitar reservas"
  ON public.reservations FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = tenant_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "Partes o admin pueden actualizar estado de reserva" ON public.reservations;
CREATE POLICY "Partes o admin pueden actualizar estado de reserva"
  ON public.reservations FOR UPDATE
  USING ((SELECT auth.uid()) = tenant_id OR (SELECT auth.uid()) = owner_id OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT auth.uid()) = tenant_id OR (SELECT auth.uid()) = owner_id OR (SELECT public.is_admin()));

-- ------------------------------------------------------------------------------
-- RLS: CONTRACTS  (INSERT más seguro)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Partes de contrato o admin pueden leerlo" ON public.contracts;
CREATE POLICY "Partes de contrato o admin pueden leerlo"
  ON public.contracts FOR SELECT
  USING (
    (SELECT public.is_admin()) OR
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = contracts.reservation_id
        AND (r.tenant_id = (SELECT auth.uid()) OR r.owner_id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Inserción de contratos" ON public.contracts;
CREATE POLICY "Inserción de contratos"
  ON public.contracts FOR INSERT
  WITH CHECK (
    (SELECT public.is_admin()) OR
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND (r.tenant_id = (SELECT auth.uid()) OR r.owner_id = (SELECT auth.uid()))
    )
  );

-- ------------------------------------------------------------------------------
-- RLS: AUDIT_LOGS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Inserción de registros de auditoría" ON public.audit_logs;
DROP POLICY IF EXISTS "Inserción de auditoría propia" ON public.audit_logs;
-- Sin política de INSERT: los registros solo los escriben funciones y triggers
-- del servidor (public.write_audit), nunca el cliente.

DROP POLICY IF EXISTS "Lectura de auditoría propia o admin" ON public.audit_logs;
CREATE POLICY "Lectura de auditoría propia o admin"
  ON public.audit_logs FOR SELECT
  USING (user_id = (SELECT auth.uid())::text OR (SELECT public.is_admin()));

-- ------------------------------------------------------------------------------
-- RLS: DISPUTES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Partes de disputa o admin pueden leerla" ON public.disputes;
CREATE POLICY "Partes de disputa o admin pueden leerla"
  ON public.disputes FOR SELECT
  USING (tenant_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "Creación de disputas" ON public.disputes;
CREATE POLICY "Creación de disputas"
  ON public.disputes FOR INSERT
  WITH CHECK (
    (SELECT public.is_admin()) OR
    tenant_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND (r.tenant_id = (SELECT auth.uid()) OR r.owner_id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Resolución de disputas por admin" ON public.disputes;
CREATE POLICY "Resolución de disputas por admin"
  ON public.disputes FOR UPDATE
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- ------------------------------------------------------------------------------
-- RLS: VISIT_REQUESTS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Partes de visita pueden ver la solicitud" ON public.visit_requests;
CREATE POLICY "Partes de visita pueden ver la solicitud"
  ON public.visit_requests FOR SELECT
  USING (tenant_id = (SELECT auth.uid()) OR owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "Creación de solicitud de visita" ON public.visit_requests;
CREATE POLICY "Creación de solicitud de visita"
  ON public.visit_requests FOR INSERT
  WITH CHECK (tenant_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "Actualización de visita" ON public.visit_requests;
CREATE POLICY "Actualización de visita"
  ON public.visit_requests FOR UPDATE
  USING (tenant_id = (SELECT auth.uid()) OR owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- ==============================================================================
-- STORAGE: BUCKETS + POLÍTICAS ESTRICTAS
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('spaces',         'spaces',         true,  10485760, ARRAY['image/jpeg','image/png','image/webp','image/avif']),
  ('kyc-documents',  'kyc-documents',  false, 10485760, ARRAY['image/jpeg','image/png','application/pdf']),
  ('kyc-biometrics', 'kyc-biometrics', false, 10485760, ARRAY['image/jpeg','image/png','image/webp']),
  ('contracts',      'contracts',      false, 10485760, ARRAY['application/pdf','image/png','text/plain'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------- Bucket: spaces (fotos de propiedades) ----------
-- Estructura de path recomendada: spaces/{owner_id}/{space_id}/foto.jpg
DROP POLICY IF EXISTS "Lectura pública de fotos de espacios" ON storage.objects;
CREATE POLICY "Lectura pública de fotos de espacios"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'spaces');

DROP POLICY IF EXISTS "Usuarios autenticados pueden subir fotos de espacios" ON storage.objects;
DROP POLICY IF EXISTS "Dueños suben fotos de sus espacios" ON storage.objects;
CREATE POLICY "Dueños suben fotos de sus espacios"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'spaces'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Dueños o admins pueden modificar fotos de espacios" ON storage.objects;
DROP POLICY IF EXISTS "Dueños modifican fotos de sus espacios" ON storage.objects;
CREATE POLICY "Dueños modifican fotos de sus espacios"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'spaces'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (SELECT public.is_admin())
    )
  )
  WITH CHECK (
    bucket_id = 'spaces'
    AND auth.role() = 'authenticated'
    AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR (SELECT public.is_admin()))
  );

DROP POLICY IF EXISTS "Dueños o admins pueden eliminar fotos de espacios" ON storage.objects;
DROP POLICY IF EXISTS "Dueños eliminan fotos de sus espacios" ON storage.objects;
CREATE POLICY "Dueños eliminan fotos de sus espacios"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'spaces'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (SELECT public.is_admin())
    )
  );

-- ---------- Bucket: kyc-documents ----------
-- Path: kyc-documents/{user_id}/documento.pdf
DROP POLICY IF EXISTS "Acceso a documentos KYC propios o admin" ON storage.objects;
CREATE POLICY "Acceso a documentos KYC propios o admin"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kyc-documents'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (SELECT public.is_admin())
    )
  );

DROP POLICY IF EXISTS "Subida de documentos KYC propios" ON storage.objects;
CREATE POLICY "Subida de documentos KYC propios"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- ---------- Bucket: kyc-biometrics ----------
DROP POLICY IF EXISTS "Acceso a biometría propia o admin" ON storage.objects;
CREATE POLICY "Acceso a biometría propia o admin"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kyc-biometrics'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (SELECT public.is_admin())
    )
  );

DROP POLICY IF EXISTS "Subida de biometría propia" ON storage.objects;
CREATE POLICY "Subida de biometría propia"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'kyc-biometrics'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- ---------- Bucket: contracts ----------
-- Path recomendado: contracts/{reservation_id}/contrato.pdf
DROP POLICY IF EXISTS "Acceso a contratos propios o admin" ON storage.objects;
CREATE POLICY "Acceso a contratos propios o admin"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'contracts'
    AND ((SELECT public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = split_part(name, '/', 1)
        AND (r.tenant_id = (SELECT auth.uid()) OR r.owner_id = (SELECT auth.uid()))
    ))
  );

DROP POLICY IF EXISTS "Subida de contratos por usuarios autenticados" ON storage.objects;
CREATE POLICY "Subida de contratos por usuarios autenticados"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'contracts'
    AND ((SELECT public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = split_part(name, '/', 1)
        AND (r.tenant_id = (SELECT auth.uid()) OR r.owner_id = (SELECT auth.uid()))
    ))
  );

-- Permisos SQL: el acceso efectivo queda limitado por las políticas RLS.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.spaces TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles, public.spaces, public.reservations, public.contracts,
  public.audit_logs, public.disputes, public.visit_requests
  TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ==============================================================================
-- FIN DEL SCHEMA V2
-- ==============================================================================
-- Notas de uso:
-- 1. Al crear un space NO necesitas enviar "id": se genera solo (spc_...).
-- 2. Igual para reservations, contracts, disputes y visit_requests.
-- 3. Para Storage de spaces sube con path: {tu_user_id}/{space_id}/nombre.jpg
-- 4. Si ya tienes datos con IDs manuales, el DEFAULT solo aplica a filas nuevas.
-- ==============================================================================

-- El rol admin no se asigna desde el registro. Después de crear y confirmar
-- tu propia cuenta, promuévela manualmente en SQL Editor, cambiando el correo:
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'TU_CORREO';


-- ##############################################################################
-- PARTE 2: MÓDULOS DE CUMPLIMIENTO DEL INFORME DE PROYECTO (v5)
--   RF-16/RNF-03 anti-sobreventa · RF-17 pagos Webpay · RF-18 cancelación y
--   reembolso · RF-21 descuentos · RF-13 favoritos · RF-34 notificaciones ·
--   RF-29 valoraciones · RF-30/31 historial KYC · RF-32 reportes y suspensión ·
--   RF-24/26 contratos SHA-256 · RF-33/RNF-14 auditoría · RNF-04 bloqueo de
--   acceso · RNF-06 guardas de servidor · Cap. XI KPI
-- ##############################################################################



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

-- audit_logs.user_id no es llave foránea a propósito: la bitácora debe conservarse
-- aunque se elimine el usuario y también registra eventos anónimos o del sistema.

CREATE OR REPLACE FUNCTION public.audit_logs_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- La fecha la fija la base. La IP la informa el backend (p_ip de write_audit)
  -- o se toma de las cabeceras del request que originó el evento.
  NEW.ip := COALESCE(NEW.ip, public.request_ip(), 'no disponible');
  NEW.user_agent := COALESCE(NEW.user_agent, public.request_user_agent());
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

-- Firmas anteriores (si existían) se eliminan para evitar llamadas ambiguas.
DROP FUNCTION IF EXISTS public.write_audit(TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.login_lock_status(TEXT);
DROP FUNCTION IF EXISTS public.register_failed_login(TEXT);
DROP FUNCTION IF EXISTS public.reset_login_attempts();

-- Registro de auditoría generado por el propio servidor (no depende del cliente).
CREATE OR REPLACE FUNCTION public.write_audit(
  p_action TEXT,
  p_severity TEXT,
  p_user_id TEXT,
  p_details JSONB,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
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
  INSERT INTO public.audit_logs (action, user_id, user_email, user_role, severity, details, ip, user_agent)
  VALUES (
    p_action,
    COALESCE(p_user_id, 'system'),
    COALESCE(v_email, 'sistema@spotly.cl'),
    COALESCE(v_role, 'admin'),
    p_severity,
    COALESCE(p_details, '{}'::jsonb),
    p_ip,
    p_user_agent
  );
END;
$$;
REVOKE ALL ON FUNCTION public.write_audit(TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_audit(TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO service_role;

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
  ON public.notifications FOR SELECT USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Crear notificaciones propias" ON public.notifications;
CREATE POLICY "Crear notificaciones propias"
  ON public.notifications FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Marcar notificaciones propias" ON public.notifications;
CREATE POLICY "Marcar notificaciones propias"
  ON public.notifications FOR UPDATE USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Eliminar notificaciones propias" ON public.notifications;
CREATE POLICY "Eliminar notificaciones propias"
  ON public.notifications FOR DELETE USING (user_id = (SELECT auth.uid()));

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
GRANT EXECUTE ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

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

-- La unicidad del RUT la garantiza el índice único anterior. No se expone una
-- función pública para consultar si un RUT existe (evita enumerar cuentas).
DROP FUNCTION IF EXISTS public.rut_available(TEXT);

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
  ON public.kyc_verifications FOR SELECT USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

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

-- Sin llave foránea a profiles a propósito: se registran intentos sobre correos
-- que pueden no corresponder a ninguna cuenta.
--
-- El contador es por (correo, IP): un tercero desde otra red no puede bloquear
-- una cuenta ajena. Además hay un límite global por IP (email = '*') contra la
-- prueba masiva de contraseñas. Las funciones solo las ejecuta el backend
-- (service_role) desde /api/auth; no están disponibles para anon/authenticated.
CREATE TABLE IF NOT EXISTS public.login_attempts (
  email TEXT NOT NULL,
  ip TEXT NOT NULL,
  failed_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (email, ip)
);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo accesible mediante las funciones siguientes.

CREATE OR REPLACE FUNCTION public.login_lock_status(p_email TEXT, p_ip TEXT)
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
  WHERE ip = COALESCE(NULLIF(trim(p_ip), ''), 'desconocida')
    AND email IN (lower(trim(p_email)), '*');
$$;

-- Incrementa un contador con ventana deslizante y lo bloquea al llegar al máximo.
CREATE OR REPLACE FUNCTION public.bump_login_counter(p_key TEXT, p_ip TEXT, p_max INTEGER)
RETURNS public.login_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_window CONSTANT INTERVAL := interval '15 minutes';
  c_lock CONSTANT INTERVAL := interval '15 minutes';
  v_row public.login_attempts;
BEGIN
  INSERT INTO public.login_attempts AS la (email, ip, failed_count, first_failed_at, updated_at)
  VALUES (p_key, p_ip, 1, now(), now())
  ON CONFLICT (email, ip) DO UPDATE SET
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

  IF v_row.failed_count >= p_max AND (v_row.locked_until IS NULL OR v_row.locked_until <= now()) THEN
    UPDATE public.login_attempts SET locked_until = now() + c_lock
    WHERE email = p_key AND ip = p_ip
    RETURNING * INTO v_row;
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_failed_login(p_email TEXT, p_ip TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_max_per_account CONSTANT INTEGER := 5;
  c_max_per_ip CONSTANT INTEGER := 20;
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_ip TEXT := COALESCE(NULLIF(trim(p_ip), ''), 'desconocida');
  v_account public.login_attempts;
  v_global public.login_attempts;
  v_locked BOOLEAN;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object('locked', false);
  END IF;

  -- Mantenimiento liviano: se purgan registros vencidos en ~1 de cada 50 llamadas.
  IF random() < 0.02 THEN
    PERFORM public.purge_old_login_attempts();
  END IF;

  v_account := public.bump_login_counter(v_email, v_ip, c_max_per_account);
  v_global := public.bump_login_counter('*', v_ip, c_max_per_ip);
  v_locked := COALESCE(v_account.locked_until > now(), false) OR COALESCE(v_global.locked_until > now(), false);

  IF v_locked AND (v_account.failed_count = c_max_per_account OR v_global.failed_count = c_max_per_ip) THEN
    PERFORM public.write_audit(
      'ACCOUNT_TEMPORARILY_LOCKED', 'security',
      COALESCE((SELECT id::text FROM public.profiles WHERE lower(email) = v_email), 'anonymous'),
      jsonb_build_object('email', v_email, 'failedAttempts', v_account.failed_count,
                         'ipAttempts', v_global.failed_count),
      v_ip
    );
  END IF;

  RETURN jsonb_build_object(
    'locked', v_locked,
    'locked_until', GREATEST(v_account.locked_until, v_global.locked_until),
    'remaining', GREATEST(c_max_per_account - v_account.failed_count, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_login_attempts(p_email TEXT, p_ip TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.login_attempts
  WHERE email = lower(trim(p_email)) AND ip = COALESCE(NULLIF(trim(p_ip), ''), 'desconocida');
$$;

REVOKE ALL ON FUNCTION public.login_lock_status(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_login_counter(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_failed_login(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_login_attempts(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_lock_status(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_failed_login(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_login_attempts(TEXT, TEXT) TO service_role;

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
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT discount_codes_usage_limit CHECK (max_uses IS NULL OR used_count <= max_uses)
);
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Administración de códigos de descuento" ON public.discount_codes;
CREATE POLICY "Administración de códigos de descuento"
  ON public.discount_codes FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

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
REVOKE ALL ON FUNCTION public.compute_discount(TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_discount(TEXT, NUMERIC) TO authenticated;

-- ==============================================================================
-- 7. RESERVAS: ANTI-SOBREVENTA, PAGO, CANCELACIÓN Y REEMBOLSO
-- ==============================================================================

ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS discount_code TEXT
  REFERENCES public.discount_codes(code) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS discount_clp NUMERIC(12,0) NOT NULL DEFAULT 0;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS refund_amount_clp NUMERIC(12,0);
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS cancelled_by UUID
  REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Reservas previas a la integración real (si existieran) quedan marcadas como simulación.
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

-- Antes de crear la restricción se anulan solapamientos heredados (si existieran).
UPDATE public.reservations r
SET status = 'cancelled',
    cancellation_reason = 'Anulada: se solapaba con una reserva anterior del mismo espacio',
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
CREATE INDEX IF NOT EXISTS idx_reservations_discount_code ON public.reservations(discount_code);

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
REVOKE ALL ON FUNCTION public.release_expired_payment_holds(TEXT) FROM PUBLIC, anon;
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
  v_unit TEXT;
  v_code TEXT;
  v_percent INTEGER;
  v_max_discount NUMERIC;
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

  -- Descuento: validación y consumo en una sola sentencia UPDATE. La fila queda
  -- bloqueada hasta el fin de la transacción, por lo que dos reservas simultáneas
  -- no pueden usar el último cupo (la segunda reevalúa used_count y no lo obtiene).
  NEW.discount_clp := 0;
  IF NEW.discount_code IS NOT NULL AND trim(NEW.discount_code) <> '' THEN
    UPDATE public.discount_codes d
    SET used_count = d.used_count + 1
    WHERE d.code = upper(trim(NEW.discount_code))
      AND d.active
      AND (d.valid_from IS NULL OR d.valid_from <= public.chile_today())
      AND (d.valid_until IS NULL OR d.valid_until >= public.chile_today())
      AND (d.max_uses IS NULL OR d.used_count < d.max_uses)
    RETURNING d.code, d.percent_off, d.max_discount_clp INTO v_code, v_percent, v_max_discount;

    IF v_code IS NULL THEN
      RAISE EXCEPTION 'Código de descuento inválido, vencido o sin cupos disponibles';
    END IF;
    NEW.discount_code := v_code;
    NEW.discount_clp := round(NEW.subtotal_clp * v_percent / 100.0);
    IF v_max_discount IS NOT NULL THEN
      NEW.discount_clp := LEAST(NEW.discount_clp, v_max_discount);
    END IF;
  ELSE
    NEW.discount_code := NULL;
  END IF;

  IF abs(NEW.total_clp - (NEW.subtotal_clp + NEW.platform_fee_clp + NEW.security_deposit_clp - NEW.discount_clp)) > 1 THEN
    RAISE EXCEPTION 'El total no coincide con subtotal + comisión + garantía − descuento';
  END IF;

  NEW.owner_id := v_space.owner_id;
  NEW.owner_name := v_space.owner_name;
  NEW.owner_rut := v_space.owner_rut;
  NEW.space_title := v_space.title;
  NEW.space_address := v_space.address || ', ' || v_space.commune;
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
    tenant_id = (SELECT auth.uid()) OR (SELECT public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.reservations r WHERE r.id = payments.reservation_id AND r.owner_id = (SELECT auth.uid())
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
  ON public.favorites FOR ALL USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

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
    tenant_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND r.tenant_id = (SELECT auth.uid())
        AND r.space_id = reviews.space_id
        AND (r.status = 'completed' OR (r.status = 'confirmed' AND r.end_date <= public.chile_today()))
    )
  );

DROP POLICY IF EXISTS "Autor o propietario editan la valoración" ON public.reviews;
CREATE POLICY "Autor o propietario editan la valoración"
  ON public.reviews FOR UPDATE
  USING (
    tenant_id = (SELECT auth.uid()) OR (SELECT public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.spaces s WHERE s.id = reviews.space_id AND s.owner_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Autor o admin eliminan la valoración" ON public.reviews;
CREATE POLICY "Autor o admin eliminan la valoración"
  ON public.reviews FOR DELETE USING (tenant_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

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
  ON public.user_reports FOR INSERT WITH CHECK (reporter_id = (SELECT auth.uid()) AND status = 'open');
DROP POLICY IF EXISTS "Ver reportes propios o admin" ON public.user_reports;
CREATE POLICY "Ver reportes propios o admin"
  ON public.user_reports FOR SELECT USING (reporter_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
DROP POLICY IF EXISTS "Gestionar reportes admin" ON public.user_reports;
CREATE POLICY "Gestionar reportes admin"
  ON public.user_reports FOR UPDATE USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

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
REVOKE ALL ON FUNCTION public.admin_set_user_suspension(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_suspension(UUID, BOOLEAN, TEXT) TO authenticated;

-- ==============================================================================
-- 13. VISITAS AL DETALLE (KPI-04 tasa de conversión)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.space_views (
  id BIGSERIAL PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_space_views_created ON public.space_views(created_at DESC);
ALTER TABLE public.space_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Registrar visita al detalle" ON public.space_views;
CREATE POLICY "Registrar visita al detalle"
  ON public.space_views FOR INSERT
  WITH CHECK (viewer_id IS NULL OR viewer_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Visitas visibles para admin" ON public.space_views;
CREATE POLICY "Visitas visibles para admin"
  ON public.space_views FOR SELECT USING ((SELECT public.is_admin()));

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
REVOKE ALL ON FUNCTION public.admin_kpis(INTEGER) FROM PUBLIC, anon;
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



-- ==============================================================================
-- RENDIMIENTO PARA MUCHOS USUARIOS: índices de las consultas y políticas frecuentes
-- ==============================================================================
-- Catálogo público: espacios activos ordenados por fecha y filtrados por comuna/categoría.
CREATE INDEX IF NOT EXISTS idx_spaces_active_recent ON public.spaces(created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_spaces_status_commune_category ON public.spaces(status, commune, category);
-- Historial y paneles: reservas por arrendatario/propietario y estado, más recientes primero.
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_recent ON public.reservations(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_owner_recent ON public.reservations(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_space_status ON public.reservations(space_id, status);
-- Liberación de retenciones de pago vencidas.
CREATE INDEX IF NOT EXISTS idx_reservations_pending_payment
  ON public.reservations(space_id, created_at) WHERE status = 'pending' AND payment_status = 'pending';
-- Pagos: búsqueda por token y orden de compra (retorno de Webpay) y por arrendatario.
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON public.payments(tenant_id, created_at DESC);
-- Contratos y visitas por reserva/espacio.
CREATE INDEX IF NOT EXISTS idx_contracts_signed_at ON public.contracts(signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_visit_requests_space_status ON public.visit_requests(space_id, tenant_id, status);
-- Notificaciones no leídas por usuario.
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id) WHERE NOT read;
-- Favoritos por espacio (eliminaciones en cascada) y valoraciones por arrendatario.
CREATE INDEX IF NOT EXISTS idx_favorites_space ON public.favorites(space_id);
CREATE INDEX IF NOT EXISTS idx_reviews_tenant ON public.reviews(tenant_id);
-- Visitas al detalle (crece rápido): por espacio y por fecha para el KPI de conversión.
CREATE INDEX IF NOT EXISTS idx_space_views_space ON public.space_views(space_id, created_at DESC);
-- KPI: verificaciones resueltas y reportes por usuario.
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_resolved ON public.kyc_verifications(resolved_at) WHERE resolved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON public.user_reports(reporter_id);
-- Auditoría: consultas por fecha y severidad.
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity_time ON public.audit_logs(severity, timestamp DESC);
-- Intentos de acceso: limpieza de registros antiguos.
CREATE INDEX IF NOT EXISTS idx_login_attempts_updated ON public.login_attempts(updated_at);

-- Limpieza de registros de intentos de acceso de más de 1 día (se llama al registrar
-- un intento fallido, así la tabla no crece indefinidamente).
CREATE OR REPLACE FUNCTION public.purge_old_login_attempts()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.login_attempts
  WHERE updated_at < now() - interval '1 day'
    AND (locked_until IS NULL OR locked_until < now());
$$;
REVOKE ALL ON FUNCTION public.purge_old_login_attempts() FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 16. DATOS PRIVADOS DE LOS ESPACIOS (RUT del propietario y dirección exacta)
-- ==============================================================================
-- RLS filtra filas, no columnas. Por eso la lectura pública de spaces se limita
-- con privilegios por columna: anon y authenticated no pueden leer owner_rut ni
-- address. Esos datos se entregan solo al propietario, a administración y a quien
-- tiene una reserva en el espacio, mediante get_spaces_private_details().
REVOKE SELECT ON public.spaces FROM anon, authenticated;
GRANT SELECT (
  id, owner_id, owner_name, owner_verified, title, description, category,
  space_environment, rental_modality, enabled_modalities, price_unit, commune, region,
  price_per_day, price_per_hour, price_per_month, capacity, surface_m2, amenities,
  rules, opening_hours, security_deposit, images, is_verified, status, rating,
  reviews_count, min_booking_days, min_booking_hours, instant_booking, created_at, updated_at
) ON public.spaces TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_spaces_private_details()
RETURNS TABLE (space_id TEXT, owner_rut TEXT, address TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.owner_rut, s.address
  FROM public.spaces s
  WHERE public.is_admin()
     OR s.owner_id = auth.uid()
     OR EXISTS (
       SELECT 1 FROM public.reservations r
       WHERE r.space_id = s.id
         AND r.tenant_id = auth.uid()
         AND r.status IN ('pending', 'confirmed', 'completed')
     )
     OR EXISTS (
       SELECT 1 FROM public.visit_requests v
       WHERE v.space_id = s.id
         AND v.tenant_id = auth.uid()
         AND v.status IN ('pending', 'confirmed')
     );
$$;
REVOKE ALL ON FUNCTION public.get_spaces_private_details() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_spaces_private_details() TO authenticated;

-- ==============================================================================
-- 17. AUDITORÍA DE EVENTOS DE NEGOCIO GENERADA EN EL SERVIDOR (RF-33)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.audit_entity_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT := COALESCE(auth.uid()::text, 'system');
BEGIN
  IF TG_TABLE_NAME = 'spaces' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.write_audit('SPACE_PUBLISHED', 'info', v_actor,
        jsonb_build_object('spaceId', NEW.id, 'title', NEW.title, 'status', NEW.status));
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM public.write_audit('SPACE_DELETED', 'warning', v_actor,
        jsonb_build_object('spaceId', OLD.id, 'title', OLD.title));
      RETURN OLD;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.write_audit('SPACE_STATUS_CHANGED', 'info', v_actor,
        jsonb_build_object('spaceId', NEW.id, 'from', OLD.status, 'to', NEW.status));
    ELSIF NEW.price_per_day IS DISTINCT FROM OLD.price_per_day
       OR NEW.price_per_hour IS DISTINCT FROM OLD.price_per_hour
       OR NEW.price_per_month IS DISTINCT FROM OLD.price_per_month THEN
      PERFORM public.write_audit('SPACE_PRICES_CHANGED', 'info', v_actor,
        jsonb_build_object('spaceId', NEW.id));
    END IF;
  ELSIF TG_TABLE_NAME = 'disputes' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.write_audit('DISPUTE_OPENED', 'warning', v_actor,
        jsonb_build_object('disputeId', NEW.id, 'reservationId', NEW.reservation_id));
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.write_audit('DISPUTE_STATUS_CHANGED', 'security', v_actor,
        jsonb_build_object('disputeId', NEW.id, 'from', OLD.status, 'to', NEW.status));
    END IF;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.owner_terms_accepted IS DISTINCT FROM OLD.owner_terms_accepted THEN
      PERFORM public.write_audit('ROLE_CHANGED', 'security', v_actor,
        jsonb_build_object('targetUserId', NEW.id, 'from', OLD.role, 'to', NEW.role,
                           'ownerTermsAccepted', NEW.owner_terms_accepted));
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_spaces_changes ON public.spaces;
CREATE TRIGGER audit_spaces_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.spaces
  FOR EACH ROW EXECUTE PROCEDURE public.audit_entity_changes();

DROP TRIGGER IF EXISTS audit_disputes_changes ON public.disputes;
CREATE TRIGGER audit_disputes_changes
  AFTER INSERT OR UPDATE ON public.disputes
  FOR EACH ROW EXECUTE PROCEDURE public.audit_entity_changes();

DROP TRIGGER IF EXISTS audit_profiles_changes ON public.profiles;
CREATE TRIGGER audit_profiles_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.audit_entity_changes();

-- La bitácora solo se lee desde el cliente; nunca se escribe ni se modifica.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon, authenticated;
-- La tabla de intentos de acceso no es accesible desde el cliente.
REVOKE ALL ON public.login_attempts FROM anon, authenticated;

-- Supabase concede por defecto todos los privilegios de las tablas nuevas a anon y
-- authenticated; aquí se dejan solo los necesarios (mínimo privilegio, RNF-06).
REVOKE ALL ON public.payments, public.kyc_verifications, public.notifications, public.favorites,
  public.user_reports, public.discount_codes, public.audit_logs, public.contracts,
  public.reservations, public.disputes, public.visit_requests, public.profiles
  FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.spaces, public.reviews FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payments, public.kyc_verifications FROM authenticated;
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Estadísticas iniciales para el planificador de consultas.
ANALYZE public.spaces;
ANALYZE public.reservations;
ANALYZE public.profiles;

COMMIT;

