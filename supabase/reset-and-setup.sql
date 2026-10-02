-- SPOTLY: script único para reiniciar y crear el esquema completo.
-- ATENCIÓN: destructivo. Borra los datos de las tablas Spotly indicadas abajo.
-- Conserva auth.users, buckets y archivos de Storage. Se recrean perfiles
-- desde auth.users para que las cuentas existentes puedan seguir ingresando.
-- Revisar y guardar respaldo antes de ejecutar en Supabase SQL Editor.
-- Ejecutar este archivo completo en una sola ejecución.

BEGIN;

-- Tablas de Spotly del esquema v2, en orden inverso de dependencias.
-- CASCADE quita también vistas/constraints dependientes dentro de public.
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
    birth_date DATE NOT NULL CHECK (birth_date <= (CURRENT_DATE - INTERVAL '18 years')::DATE),
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

-- Catálogo público: nunca publica dirección exacta, RUT ni datos de contacto.
-- La vista pertenece al rol propietario del esquema para exponer solo estas
-- columnas de filas activas; las escrituras siguen pasando por RLS en spaces.
CREATE OR REPLACE VIEW public.spaces_public
WITH (security_barrier = true)
AS
SELECT id, owner_id, split_part(owner_name, ' ', 1) AS owner_name,
       owner_verified, title, description, category,
       space_environment, rental_modality, enabled_modalities, price_unit,
       commune, region, price_per_day, price_per_hour, price_per_month,
       capacity, surface_m2, amenities, rules, opening_hours,
       security_deposit, images, is_verified, status, rating, reviews_count,
       min_booking_days, min_booking_hours, instant_booking, created_at
FROM public.spaces
WHERE status = 'active';

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_one_per_reservation
  ON public.contracts(reservation_id);

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
SET search_path = ''
AS $$
DECLARE
  profile_role TEXT;
BEGIN
  -- El registro público solo puede crear arrendatarios o propietarios,
  -- nunca administradores. Los admin se asignan manualmente desde SQL Editor.
  -- Los metadatos del registro son editables por el cliente: nunca asignar
  -- roles privilegiados ni aceptación legal desde ese payload.
  profile_role := 'tenant';

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
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      NULLIF(CONCAT_WS(' ', NULLIF(NEW.raw_user_meta_data->>'first_names', ''),
                           NULLIF(NEW.raw_user_meta_data->>'surnames', '')), '')
    ),
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
    false,
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
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    NULLIF(u.raw_user_meta_data->>'name', ''),
    NULLIF(CONCAT_WS(' ', NULLIF(u.raw_user_meta_data->>'first_names', ''),
                         NULLIF(u.raw_user_meta_data->>'surnames', '')), '')
  ),
  COALESCE(u.raw_user_meta_data->>'first_names', ''),
  COALESCE(u.raw_user_meta_data->>'surnames', ''),
  COALESCE(u.email, ''),
  COALESCE(u.raw_user_meta_data->>'rut', ''),
  COALESCE(u.raw_user_meta_data->>'phone', ''),
  COALESCE(u.raw_user_meta_data->>'gender', 'prefiero_no_decir'),
  NULLIF(u.raw_user_meta_data->>'birth_date', '')::date,
  'tenant',
  false,
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

-- Los datos del contrato se toman del perfil y espacio reales, no del cliente.
CREATE OR REPLACE FUNCTION public.prepare_reservation_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_space public.spaces%ROWTYPE;
  v_tenant public.profiles%ROWTYPE;
  v_owner public.profiles%ROWTYPE;
  v_rate NUMERIC;
  v_units NUMERIC;
  v_days INTEGER;
  v_deposit NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para solicitar una reserva';
  END IF;

  -- Serializa solicitudes concurrentes del mismo espacio para impedir dobles reservas.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.space_id));

  SELECT * INTO v_space FROM public.spaces
   WHERE id = NEW.space_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El espacio no existe o no está disponible';
  END IF;

  SELECT * INTO v_tenant FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_owner FROM public.profiles WHERE id = v_space.owner_id;
  IF v_tenant.id IS NULL OR v_owner.id IS NULL THEN
    RAISE EXCEPTION 'No se encontraron los perfiles de la reserva';
  END IF;
  IF v_tenant.verification_status <> 'verified' THEN
    RAISE EXCEPTION 'Debes completar la verificación de identidad para reservar';
  END IF;

  NEW.tenant_id := v_tenant.id;
  NEW.tenant_name := v_tenant.full_name;
  NEW.tenant_email := v_tenant.email;
  NEW.tenant_phone := v_tenant.phone;
  NEW.tenant_rut := v_tenant.rut;
  NEW.owner_id := v_owner.id;
  NEW.owner_name := v_owner.full_name;
  NEW.owner_rut := v_owner.rut;
  NEW.space_title := v_space.title;
  NEW.space_address := v_space.address;
  NEW.space_image := COALESCE(v_space.images[1], '');
  NEW.space_category := v_space.category;
  NEW.space_environment := v_space.space_environment;
  NEW.rental_modality := COALESCE(NEW.rental_modality, v_space.rental_modality, 'por_dia');
  v_days := NEW.end_date - NEW.start_date + 1;
  IF v_days < 1 THEN RAISE EXCEPTION 'Rango de fechas inválido'; END IF;

  IF NEW.rental_modality = 'por_hora' THEN
    IF NEW.hour_start IS NULL OR NEW.hour_end IS NULL
       OR NEW.hour_end <= NEW.hour_start OR NEW.hour_end - NEW.hour_start > 24 THEN
      RAISE EXCEPTION 'Horario de reserva inválido';
    END IF;
    v_units := NEW.hour_end - NEW.hour_start;
  ELSIF NEW.rental_modality = 'mensual' THEN
    v_units := CEIL(v_days::NUMERIC / 30);
  ELSE
    v_units := v_days;
  END IF;

  NEW.duration_units := v_units;
  NEW.total_days := v_units::INTEGER;

  IF NEW.rental_modality = 'por_hora' THEN
    v_rate := COALESCE(v_space.price_per_hour, 45000);
    v_deposit := COALESCE(NULLIF(v_space.security_deposit, 0), 50000);
    NEW.price_unit := 'hour';
  ELSIF NEW.rental_modality = 'mensual' THEN
    v_rate := COALESCE(v_space.price_per_month, 3800000);
    v_deposit := COALESCE(NULLIF(v_space.security_deposit, 0), 150000);
    NEW.price_unit := 'month';
  ELSE
    v_rate := v_space.price_per_day;
    v_deposit := COALESCE(NULLIF(v_space.security_deposit, 0), 150000);
    NEW.price_unit := 'day';
  END IF;

  NEW.daily_rate_clp := v_rate;
  NEW.subtotal_clp := ROUND(v_rate * v_units);
  NEW.platform_fee_clp := ROUND(NEW.subtotal_clp * 0.05);
  NEW.security_deposit_clp := v_deposit;
  NEW.total_clp := NEW.subtotal_clp + NEW.platform_fee_clp + v_deposit;
  NEW.status := 'pending';
  NEW.dispute_status := 'none';
  NEW.dispute_reason := NULL;
  NEW.digital_contract_id := NULL;

  IF EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.space_id = NEW.space_id
      AND r.status IN ('pending', 'confirmed')
      AND daterange(r.start_date, r.end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
      AND NOT (
        r.rental_modality = 'por_hora'
        AND NEW.rental_modality = 'por_hora'
        AND r.start_date = NEW.start_date
        AND r.end_date = NEW.end_date
        AND (r.hour_end <= NEW.hour_start OR NEW.hour_end <= r.hour_start)
      )
  ) THEN
    RAISE EXCEPTION 'El espacio ya tiene una reserva que se cruza con ese horario';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_reservation_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.space_id IS DISTINCT FROM OLD.space_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.end_date IS DISTINCT FROM OLD.end_date
     OR NEW.total_clp IS DISTINCT FROM OLD.total_clp
     OR NEW.subtotal_clp IS DISTINCT FROM OLD.subtotal_clp
     OR NEW.platform_fee_clp IS DISTINCT FROM OLD.platform_fee_clp
     OR NEW.security_deposit_clp IS DISTINCT FROM OLD.security_deposit_clp
     OR NEW.payment_simulation IS DISTINCT FROM OLD.payment_simulation
     OR NEW.dispute_status IS DISTINCT FROM OLD.dispute_status
     OR NEW.dispute_reason IS DISTINCT FROM OLD.dispute_reason THEN
    RAISE EXCEPTION 'No puedes modificar los datos protegidos de una reserva';
  END IF;

  IF NEW.digital_contract_id IS DISTINCT FROM OLD.digital_contract_id
     AND NOT EXISTS (
       SELECT 1 FROM public.contracts c
       WHERE c.id = NEW.digital_contract_id AND c.reservation_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'El contrato debe pertenecer a esta reserva';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF auth.uid() = OLD.tenant_id THEN
      IF NOT (OLD.status = 'pending' AND NEW.status = 'cancelled') THEN
        RAISE EXCEPTION 'El arrendatario solo puede cancelar una reserva pendiente';
      END IF;
    ELSIF auth.uid() = OLD.owner_id THEN
      IF NOT (
        (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'rejected'))
        OR (OLD.status = 'confirmed' AND NEW.status IN ('completed', 'cancelled'))
      ) THEN
        RAISE EXCEPTION 'Transición de estado de reserva no autorizada';
      END IF;
    ELSE
      RAISE EXCEPTION 'No eres parte de esta reserva';
    END IF;
  ELSIF NEW.digital_contract_id IS NOT DISTINCT FROM OLD.digital_contract_id THEN
    RAISE EXCEPTION 'La actualización no contiene ningún cambio permitido';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_visit_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_space public.spaces%ROWTYPE;
  v_tenant public.profiles%ROWTYPE;
  v_owner public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para solicitar una visita';
  END IF;
  SELECT * INTO v_space FROM public.spaces
   WHERE id = NEW.space_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El espacio no existe o no está disponible';
  END IF;
  SELECT * INTO v_tenant FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_owner FROM public.profiles WHERE id = v_space.owner_id;
  NEW.tenant_id := v_tenant.id;
  NEW.tenant_name := v_tenant.full_name;
  NEW.tenant_email := v_tenant.email;
  NEW.tenant_phone := v_tenant.phone;
  NEW.owner_id := v_owner.id;
  NEW.owner_name := split_part(v_owner.full_name, ' ', 1);
  NEW.owner_rut := NULL;
  NEW.space_title := v_space.title;
  NEW.space_address := v_space.commune || ', ' || v_space.region;
  NEW.space_image := COALESCE(v_space.images[1], '');
  NEW.status := 'pending';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_audit_log_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    -- Alta de Auth se ejecuta desde un trigger del sistema sin JWT de usuario.
    -- Solo se acepta el registro si el perfil ya fue creado para ese UUID.
    IF NEW.action <> 'USER_REGISTERED_SUPABASE' THEN
      RAISE EXCEPTION 'La auditoría requiere una sesión autenticada';
    END IF;
    SELECT * INTO v_profile FROM public.profiles WHERE id = NEW.user_id::uuid;
  ELSE
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  END IF;
  IF v_profile.id IS NULL THEN RAISE EXCEPTION 'Perfil no encontrado'; END IF;
  NEW.user_id := v_profile.id::text;
  NEW.user_email := v_profile.email;
  NEW.user_role := v_profile.role;
  NEW.timestamp := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_contract_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_reservation FROM public.reservations
   WHERE id = NEW.reservation_id
     AND (tenant_id = auth.uid() OR owner_id = auth.uid() OR public.is_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La reserva no existe o no tienes acceso';
  END IF;

  NEW.space_title := v_reservation.space_title;
  NEW.space_address := v_reservation.space_address;
  NEW.tenant_name := v_reservation.tenant_name;
  NEW.tenant_rut := v_reservation.tenant_rut;
  NEW.owner_name := v_reservation.owner_name;
  NEW.owner_rut := v_reservation.owner_rut;
  NEW.total_clp := v_reservation.total_clp;
  NEW.guarantee_deposit_clp := v_reservation.security_deposit_clp;
  NEW.start_date := v_reservation.start_date;
  NEW.end_date := v_reservation.end_date;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_contract_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Los contratos firmados son inmutables';
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_space_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile.role <> 'owner' THEN RAISE EXCEPTION 'Solo propietarios pueden publicar'; END IF;
    NEW.owner_id := v_profile.id;
    NEW.owner_name := v_profile.full_name;
    NEW.owner_rut := v_profile.rut;
    NEW.owner_verified := v_profile.verification_status = 'verified';
    NEW.is_verified := false;
    NEW.status := 'pending_approval';
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN RETURN NEW; END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.owner_name IS DISTINCT FROM OLD.owner_name
     OR NEW.owner_rut IS DISTINCT FROM OLD.owner_rut
     OR NEW.owner_verified IS DISTINCT FROM OLD.owner_verified
     OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.reviews_count IS DISTINCT FROM OLD.reviews_count THEN
    RAISE EXCEPTION 'Solo administración puede cambiar verificación y reputación';
  END IF;
  IF NEW.status = 'active' AND OLD.status <> 'active' THEN
    RAISE EXCEPTION 'Solo administración puede activar un espacio';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_spaces_write ON public.spaces;
CREATE TRIGGER guard_spaces_write
  BEFORE INSERT OR UPDATE ON public.spaces
  FOR EACH ROW EXECUTE PROCEDURE public.guard_space_write();

DROP TRIGGER IF EXISTS prepare_reservation_insert ON public.reservations;
CREATE TRIGGER prepare_reservation_insert
  BEFORE INSERT ON public.reservations
  FOR EACH ROW EXECUTE PROCEDURE public.prepare_reservation_insert();

DROP TRIGGER IF EXISTS guard_reservation_update ON public.reservations;
CREATE TRIGGER guard_reservation_update
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE PROCEDURE public.guard_reservation_update();

DROP TRIGGER IF EXISTS prepare_visit_insert ON public.visit_requests;
CREATE TRIGGER prepare_visit_insert
  BEFORE INSERT ON public.visit_requests
  FOR EACH ROW EXECUTE PROCEDURE public.prepare_visit_insert();

DROP TRIGGER IF EXISTS prepare_audit_log_insert ON public.audit_logs;
CREATE TRIGGER prepare_audit_log_insert
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE PROCEDURE public.prepare_audit_log_insert();

DROP TRIGGER IF EXISTS prepare_contract_insert ON public.contracts;
CREATE TRIGGER prepare_contract_insert
  BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE PROCEDURE public.prepare_contract_insert();

DROP TRIGGER IF EXISTS reject_contract_update ON public.contracts;
CREATE TRIGGER reject_contract_update
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE PROCEDURE public.reject_contract_update();

-- ------------------------------------------------------------------------------
-- RLS: PROFILES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lectura pública de perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Lectura de perfil propio o administrador" ON public.profiles;
CREATE POLICY "Lectura de perfil propio o administrador"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Actualización de perfil propio o admin" ON public.profiles;
CREATE POLICY "Actualización de perfil propio o admin"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Inserción de perfil propio" ON public.profiles;
-- El alta de perfiles la hace el trigger SECURITY DEFINER desde auth.users.

-- ------------------------------------------------------------------------------
-- RLS: SPACES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lectura pública de espacios activos" ON public.spaces;
DROP POLICY IF EXISTS "Propietario o administración lee espacio privado" ON public.spaces;
CREATE POLICY "Propietario o administración lee espacio privado"
  ON public.spaces FOR SELECT
  USING (auth.uid() = owner_id OR public.is_admin());

DROP POLICY IF EXISTS "Propietarios pueden crear espacios" ON public.spaces;
CREATE POLICY "Propietarios pueden crear espacios"
  ON public.spaces FOR INSERT
  WITH CHECK (
    public.is_admin() OR (
      auth.uid() = owner_id AND EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'owner'
      )
    )
  );

DROP POLICY IF EXISTS "Propietarios pueden actualizar sus espacios" ON public.spaces;
CREATE POLICY "Propietarios pueden actualizar sus espacios"
  ON public.spaces FOR UPDATE
  USING (auth.uid() = owner_id OR public.is_admin())
  WITH CHECK (
    public.is_admin() OR (
      auth.uid() = owner_id AND EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'owner'
      )
    )
  );

DROP POLICY IF EXISTS "Propietarios pueden eliminar sus espacios" ON public.spaces;
CREATE POLICY "Propietarios pueden eliminar sus espacios"
  ON public.spaces FOR DELETE
  USING (auth.uid() = owner_id OR public.is_admin());

-- ------------------------------------------------------------------------------
-- RLS: RESERVATIONS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Partes de la reserva o admin pueden verla" ON public.reservations;
CREATE POLICY "Partes de la reserva o admin pueden verla"
  ON public.reservations FOR SELECT
  USING (auth.uid() = tenant_id OR auth.uid() = owner_id OR public.is_admin());

DROP POLICY IF EXISTS "Inquilinos pueden solicitar reservas" ON public.reservations;
CREATE POLICY "Inquilinos pueden solicitar reservas"
  ON public.reservations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = tenant_id);

DROP POLICY IF EXISTS "Partes o admin pueden actualizar estado de reserva" ON public.reservations;
CREATE POLICY "Partes o admin pueden actualizar estado de reserva"
  ON public.reservations FOR UPDATE
  USING (auth.uid() = tenant_id OR auth.uid() = owner_id OR public.is_admin())
  WITH CHECK (auth.uid() = tenant_id OR auth.uid() = owner_id OR public.is_admin());

-- ------------------------------------------------------------------------------
-- RLS: CONTRACTS  (INSERT más seguro)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Partes de contrato o admin pueden leerlo" ON public.contracts;
CREATE POLICY "Partes de contrato o admin pueden leerlo"
  ON public.contracts FOR SELECT
  USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = contracts.reservation_id
        AND (r.tenant_id = auth.uid() OR r.owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Inserción de contratos" ON public.contracts;
CREATE POLICY "Inserción de contratos"
  ON public.contracts FOR INSERT
  WITH CHECK (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND r.tenant_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------------
-- RLS: AUDIT_LOGS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Inserción de registros de auditoría" ON public.audit_logs;
CREATE POLICY "Inserción de auditoría propia"
  ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Lectura de auditoría propia o admin" ON public.audit_logs;
CREATE POLICY "Lectura de auditoría propia o admin"
  ON public.audit_logs FOR SELECT
  USING (user_id = auth.uid()::text OR public.is_admin());

-- ------------------------------------------------------------------------------
-- RLS: DISPUTES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Partes de disputa o admin pueden leerla" ON public.disputes;
CREATE POLICY "Partes de disputa o admin pueden leerla"
  ON public.disputes FOR SELECT
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = disputes.reservation_id
        AND (r.tenant_id = auth.uid() OR r.owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Creación de disputas" ON public.disputes;
CREATE POLICY "Creación de disputas"
  ON public.disputes FOR INSERT
  WITH CHECK (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND (r.tenant_id = auth.uid() OR r.owner_id = auth.uid())
        AND disputes.tenant_id = r.tenant_id
    )
  );

DROP POLICY IF EXISTS "Resolución de disputas por admin" ON public.disputes;
CREATE POLICY "Resolución de disputas por admin"
  ON public.disputes FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- RLS: VISIT_REQUESTS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Partes de visita pueden ver la solicitud" ON public.visit_requests;
CREATE POLICY "Partes de visita pueden ver la solicitud"
  ON public.visit_requests FOR SELECT
  USING (tenant_id = auth.uid() OR owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Creación de solicitud de visita" ON public.visit_requests;
CREATE POLICY "Creación de solicitud de visita"
  ON public.visit_requests FOR INSERT
  WITH CHECK (tenant_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Actualización de visita" ON public.visit_requests;
-- Las visitas se crean desde solicitudes. Los cambios de estado no se escriben
-- directamente desde el cliente; requieren una función de servidor autorizada.

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
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Dueños o admins pueden modificar fotos de espacios" ON storage.objects;
DROP POLICY IF EXISTS "Dueños modifican fotos de sus espacios" ON storage.objects;
CREATE POLICY "Dueños modifican fotos de sus espacios"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'spaces'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  )
  WITH CHECK (
    bucket_id = 'spaces'
    AND auth.role() = 'authenticated'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin())
  );

DROP POLICY IF EXISTS "Dueños o admins pueden eliminar fotos de espacios" ON storage.objects;
DROP POLICY IF EXISTS "Dueños eliminan fotos de sus espacios" ON storage.objects;
CREATE POLICY "Dueños eliminan fotos de sus espacios"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'spaces'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
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
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "Subida de documentos KYC propios" ON storage.objects;
CREATE POLICY "Subida de documentos KYC propios"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------- Bucket: kyc-biometrics ----------
DROP POLICY IF EXISTS "Acceso a biometría propia o admin" ON storage.objects;
CREATE POLICY "Acceso a biometría propia o admin"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kyc-biometrics'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "Subida de biometría propia" ON storage.objects;
CREATE POLICY "Subida de biometría propia"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'kyc-biometrics'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------- Bucket: contracts ----------
-- Path recomendado: contracts/{reservation_id}/contrato.pdf
DROP POLICY IF EXISTS "Acceso a contratos propios o admin" ON storage.objects;
CREATE POLICY "Acceso a contratos propios o admin"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'contracts'
    AND (public.is_admin() OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = split_part(name, '/', 1)
        AND (r.tenant_id = auth.uid() OR r.owner_id = auth.uid())
    ))
  );

DROP POLICY IF EXISTS "Subida de contratos por usuarios autenticados" ON storage.objects;
CREATE POLICY "Subida de contratos por usuarios autenticados"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'contracts'
    AND (public.is_admin() OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = split_part(name, '/', 1)
        AND (r.tenant_id = auth.uid() OR r.owner_id = auth.uid())
    ))
  );

-- Permisos SQL: el acceso efectivo queda limitado por las políticas RLS.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
REVOKE ALL ON public.spaces_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.spaces_public TO anon, authenticated;
REVOKE SELECT ON public.spaces FROM anon;
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

COMMIT;

