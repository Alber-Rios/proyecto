-- ==============================================================================
-- SPOTLY CHILE · ESQUEMA COMPLETO DE BASE DE DATOS (script único)
-- ==============================================================================
-- Crea desde cero todo el esquema: tablas, índices, funciones, disparadores,
-- seguridad por filas (RLS), permisos, Storage y tiempo real.
--
-- Incluye: categorías de espacio en español, garantía opcional solo en arriendos
-- mensuales, billetera de tarjetas (Transbank Oneclick Mall), anti-sobreventa,
-- pagos Webpay Plus, contratos SHA-256, auditoría de solo adición, valoraciones,
-- favoritos, notificaciones, KYC, reportes, descuentos, KPI, bloqueos de calendario,
-- liquidaciones a propietarios, reembolsos, consentimientos, soporte, anonimización
-- de cuentas y mantenimiento automático con pg_cron.
--
-- ATENCIÓN: es destructivo. Borra las tablas y funciones de Spotly en el esquema
-- public. Conserva auth.users (las cuentas), los buckets y los archivos de Storage;
-- los perfiles se recrean desde auth.users. Haz un respaldo antes de ejecutarlo.
--
-- Cómo ejecutarlo: Supabase → SQL Editor → New query → pegar TODO el archivo → Run.
-- Corre en una sola transacción: si algo falla, no se aplica nada.
--
-- Después de ejecutarlo, vuelve a asignar tu cuenta de administrador:
--   UPDATE public.profiles SET role = 'admin' WHERE email = 'TU_CORREO';
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. LIMPIEZA
-- ==============================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

DROP TABLE IF EXISTS
  public.support_tickets, public.user_consents, public.payment_refunds,
  public.owner_payouts, public.space_blocks,
  public.space_views, public.user_reports, public.reviews, public.favorites,
  public.payments, public.wallet_cards, public.discount_codes, public.login_attempts,
  public.kyc_verifications, public.notifications, public.saved_cards,
  public.visit_requests, public.disputes, public.audit_logs, public.contracts,
  public.reservations, public.spaces, public.profiles
CASCADE;

-- Elimina todas las funciones de public (versiones antiguas incluidas), salvo las
-- que pertenecen a extensiones. CASCADE quita también las políticas de Storage que
-- dependían de ellas; se vuelven a crear más abajo.
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', f.signature);
  END LOOP;
END $$;

-- ==============================================================================
-- 2. EXTENSIONES
-- ==============================================================================
-- btree_gist permite la restricción de exclusión anti-sobreventa (texto + rango).
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
-- pg_trgm acelera la búsqueda del catálogo por título (ILIKE '%texto%').
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Ninguna función nueva queda ejecutable por defecto para clientes: los permisos
-- se conceden uno a uno en la sección 10 (mínimo privilegio).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- ==============================================================================
-- 3. FUNCIONES BÁSICAS (no dependen de tablas)
-- ==============================================================================

-- ID legible: spc_xxxx, res_xxxx, etc.
CREATE FUNCTION public.generate_id(prefix TEXT DEFAULT 'id')
RETURNS TEXT
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  SELECT prefix || '_' || replace(gen_random_uuid()::text, '-', '');
$$;

CREATE FUNCTION public.normalize_rut(r TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(upper(regexp_replace(COALESCE(r, ''), '[^0-9kK]', '', 'g')), '');
$$;

CREATE FUNCTION public.chile_today()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (now() AT TIME ZONE 'America/Santiago')::date;
$$;

-- IP real del cliente, tomada de las cabeceras que PostgREST expone por request.
CREATE FUNCTION public.request_ip()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
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

CREATE FUNCTION public.request_user_agent()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN left(NULLIF(current_setting('request.headers', true), '')::json->>'user-agent', 500);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Llamadas de confianza: SQL Editor / service role (sin JWT de usuario) o funciones
-- internas que marcan la transacción con spotly.trusted = on. Los roles anon y
-- authenticated nunca son de confianza.
CREATE FUNCTION public.is_trusted_context()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(current_setting('spotly.trusted', true), '') = 'on'
      OR auth.role() = 'service_role'
      OR COALESCE(current_setting('role', true), '') = 'service_role'
      OR (
        auth.role() IS NULL
        AND COALESCE(current_setting('role', true), 'none') NOT IN ('anon', 'authenticated')
      );
$$;

-- Entra y sale del modo de confianza restaurando el valor previo, para que una
-- función anidada no apague el modo que activó la función que la llamó.
CREATE FUNCTION public.begin_trusted()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev TEXT := COALESCE(current_setting('spotly.trusted', true), '');
BEGIN
  PERFORM set_config('spotly.trusted', 'on', true);
  RETURN v_prev;
END;
$$;

CREATE FUNCTION public.end_trusted(p_prev TEXT)
RETURNS VOID
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  SELECT set_config('spotly.trusted', CASE WHEN p_prev = 'on' THEN 'on' ELSE 'off' END, true);
$$;

-- Rango ocupado (hora local de Chile). Misma regla que las columnas generadas
-- booking_period / block_period; se usa en disparadores BEFORE, donde las columnas
-- generadas todavía no están calculadas.
CREATE FUNCTION public.period_range(p_start DATE, p_end DATE, p_hour_start INTEGER, p_hour_end INTEGER)
RETURNS tsrange
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_hour_start IS NOT NULL AND p_hour_end IS NOT NULL
         AND (p_end > p_start OR p_hour_end > p_hour_start)
    THEN tsrange(p_start + make_interval(hours => p_hour_start),
                 p_end + make_interval(hours => p_hour_end), '[)')
    ELSE tsrange(p_start::timestamp, (p_end + 1)::timestamp, '[)')
  END;
$$;

CREATE FUNCTION public.set_current_timestamp_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 4. TABLAS
-- ==============================================================================

-- ---------- profiles: perfiles sincronizados con auth.users ----------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL CHECK (length(full_name) <= 200),
  first_names TEXT CHECK (first_names IS NULL OR length(first_names) <= 120),
  surnames TEXT CHECK (surnames IS NULL OR length(surnames) <= 120),
  email TEXT NOT NULL UNIQUE CHECK (length(email) <= 320),
  rut TEXT CHECK (rut IS NULL OR length(rut) <= 15),
  phone TEXT CHECK (phone IS NULL OR length(phone) <= 30),
  avatar_url TEXT CHECK (avatar_url IS NULL OR length(avatar_url) <= 2048),
  gender TEXT CHECK (gender IN ('masculino', 'femenino', 'no_binario', 'otro', 'prefiero_no_decir')),
  birth_date DATE CHECK (birth_date IS NULL OR birth_date <= (CURRENT_DATE - INTERVAL '18 years')::DATE),
  role TEXT NOT NULL DEFAULT 'tenant' CHECK (role IN ('tenant', 'owner', 'admin')),
  owner_terms_accepted BOOLEAN NOT NULL DEFAULT false,
  owner_application_date TIMESTAMPTZ,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'in_progress', 'pending_review', 'verified', 'rejected')),
  kyc_rejection_reason TEXT CHECK (kyc_rejection_reason IS NULL OR length(kyc_rejection_reason) <= 1000),
  kyc_data JSONB DEFAULT '{}'::jsonb,
  commune TEXT CHECK (commune IS NULL OR length(commune) <= 100),
  city TEXT CHECK (city IS NULL OR length(city) <= 100),
  is_suspended BOOLEAN NOT NULL DEFAULT false,
  suspended_reason TEXT CHECK (suspended_reason IS NULL OR length(suspended_reason) <= 1000),
  suspended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.profiles IS 'Perfiles de usuarios sincronizados con auth.users';

-- ---------- spaces: espacios publicados ----------
CREATE TABLE public.spaces (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('spc'),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_name TEXT NOT NULL CHECK (length(owner_name) <= 200),
  owner_rut TEXT NOT NULL CHECK (length(owner_rut) <= 15),
  owner_verified BOOLEAN NOT NULL DEFAULT false,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 150),
  description TEXT CHECK (description IS NULL OR length(description) <= 10000),
  category TEXT NOT NULL CHECK (category IN (
    'departamento', 'casa', 'cabana', 'oficina', 'cowork', 'sala_reuniones', 'consulta', 'estudio',
    'salon_eventos', 'quincho', 'terreno', 'local_comercial', 'bodega', 'estacionamiento', 'otro')),
  space_environment TEXT NOT NULL DEFAULT 'cerrado' CHECK (space_environment IN ('abierto', 'cerrado')),
  rental_modality TEXT NOT NULL DEFAULT 'por_dia' CHECK (rental_modality IN ('por_hora', 'por_dia', 'mensual', 'abierto')),
  enabled_modalities TEXT[] DEFAULT ARRAY['por_dia']::TEXT[]
    CHECK (enabled_modalities IS NULL OR enabled_modalities <@ ARRAY['por_hora', 'por_dia', 'mensual', 'abierto']::TEXT[]),
  price_unit TEXT DEFAULT 'day' CHECK (price_unit IN ('hour', 'day', 'month')),
  commune TEXT NOT NULL CHECK (length(commune) <= 100),
  region TEXT NOT NULL CHECK (length(region) <= 100),
  address TEXT NOT NULL CHECK (length(address) <= 300),
  price_per_day NUMERIC(12,0) NOT NULL CHECK (price_per_day >= 0),
  price_per_hour NUMERIC(12,0) CHECK (price_per_hour IS NULL OR price_per_hour >= 0),
  price_per_month NUMERIC(12,0) CHECK (price_per_month IS NULL OR price_per_month >= 0),
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 0 AND 100000),
  surface_m2 NUMERIC NOT NULL DEFAULT 1 CHECK (surface_m2 > 0 AND surface_m2 <= 1000000),
  amenities TEXT[] DEFAULT '{}'::TEXT[] CHECK (amenities IS NULL OR cardinality(amenities) <= 60),
  rules TEXT[] DEFAULT '{}'::TEXT[] CHECK (rules IS NULL OR cardinality(rules) <= 60),
  opening_hours TEXT CHECK (opening_hours IS NULL OR length(opening_hours) <= 200),
  security_deposit NUMERIC(12,0) NOT NULL DEFAULT 0 CHECK (security_deposit >= 0),
  images TEXT[] DEFAULT '{}'::TEXT[] CHECK (images IS NULL OR cardinality(images) <= 20),
  is_verified BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('active', 'pending_approval', 'paused')),
  rating NUMERIC(2,1) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  reviews_count INTEGER NOT NULL DEFAULT 0 CHECK (reviews_count >= 0),
  min_booking_days INTEGER DEFAULT 1 CHECK (min_booking_days IS NULL OR min_booking_days >= 1),
  min_booking_hours INTEGER DEFAULT 1 CHECK (min_booking_hours IS NULL OR min_booking_hours BETWEEN 1 AND 24),
  instant_booking BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.spaces IS 'Espacios publicados: departamentos, oficinas, salones, quinchos y otros recintos';

-- ---------- discount_codes: códigos de descuento (RF-21) ----------
CREATE TABLE public.discount_codes (
  code TEXT PRIMARY KEY CHECK (code = upper(code) AND length(code) BETWEEN 3 AND 30),
  description TEXT CHECK (description IS NULL OR length(description) <= 300),
  percent_off INTEGER NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
  max_discount_clp NUMERIC(12,0) CHECK (max_discount_clp IS NULL OR max_discount_clp > 0),
  valid_from DATE,
  valid_until DATE,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT discount_codes_usage_limit CHECK (max_uses IS NULL OR used_count <= max_uses),
  CONSTRAINT discount_codes_dates CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_until >= valid_from)
);

-- ---------- reservations: reservas (RF-15 a RF-18) ----------
CREATE TABLE public.reservations (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('res'),
  -- RESTRICT: una reserva es un registro financiero y legal; no se borra en cascada
  -- al eliminar el espacio o la cuenta (el espacio se pausa, la cuenta se anonimiza).
  space_id TEXT NOT NULL REFERENCES public.spaces(id) ON DELETE RESTRICT,
  space_title TEXT NOT NULL,
  space_address TEXT,
  space_image TEXT,
  space_category TEXT,
  space_environment TEXT,
  tenant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  tenant_name TEXT NOT NULL CHECK (length(tenant_name) <= 200),
  tenant_email TEXT NOT NULL CHECK (length(tenant_email) <= 320),
  tenant_phone TEXT CHECK (tenant_phone IS NULL OR length(tenant_phone) <= 30),
  tenant_rut TEXT NOT NULL CHECK (length(tenant_rut) <= 15),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  owner_name TEXT NOT NULL,
  owner_rut TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days INTEGER NOT NULL CHECK (total_days >= 0),
  daily_rate_clp NUMERIC(12,0) NOT NULL CHECK (daily_rate_clp >= 0),
  rental_modality TEXT DEFAULT 'por_dia' CHECK (rental_modality IS NULL OR rental_modality IN ('por_hora', 'por_dia', 'mensual', 'abierto')),
  duration_units NUMERIC CHECK (duration_units IS NULL OR duration_units >= 0),
  price_unit TEXT DEFAULT 'day' CHECK (price_unit IS NULL OR price_unit IN ('hour', 'day', 'month')),
  hour_start INTEGER CHECK (hour_start IS NULL OR hour_start BETWEEN 0 AND 23),
  hour_end INTEGER CHECK (hour_end IS NULL OR hour_end BETWEEN 1 AND 24),
  time_slot_string TEXT CHECK (time_slot_string IS NULL OR length(time_slot_string) <= 100),
  rental_month TEXT CHECK (rental_month IS NULL OR length(rental_month) <= 50),
  subtotal_clp NUMERIC(12,0) NOT NULL CHECK (subtotal_clp >= 0),
  platform_fee_clp NUMERIC(12,0) NOT NULL CHECK (platform_fee_clp >= 0),
  security_deposit_clp NUMERIC(12,0) NOT NULL DEFAULT 0 CHECK (security_deposit_clp >= 0),
  discount_code TEXT REFERENCES public.discount_codes(code) ON UPDATE CASCADE ON DELETE SET NULL,
  discount_clp NUMERIC(12,0) NOT NULL DEFAULT 0 CHECK (discount_clp >= 0),
  total_clp NUMERIC(12,0) NOT NULL CHECK (total_clp >= 0),
  intended_use TEXT NOT NULL CHECK (length(intended_use) <= 2000),
  payment_simulation JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'rejected', 'completed')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'refund_pending', 'refunded',
                              'partially_refunded', 'not_required', 'legacy_simulated')),
  refund_amount_clp NUMERIC(12,0) CHECK (refund_amount_clp IS NULL OR refund_amount_clp >= 0),
  digital_contract_id TEXT,
  dispute_status TEXT DEFAULT 'none'
    CHECK (dispute_status IN ('none', 'opened', 'in_review', 'resolved')),
  dispute_reason TEXT CHECK (dispute_reason IS NULL OR length(dispute_reason) <= 4000),
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancellation_reason TEXT CHECK (cancellation_reason IS NULL OR length(cancellation_reason) <= 1000),
  confirmed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Período ocupado como rango de tiempo (hora local de Chile, sin zona).
  booking_period tsrange GENERATED ALWAYS AS (
    CASE
      WHEN hour_start IS NOT NULL AND hour_end IS NOT NULL
           AND (end_date > start_date OR hour_end > hour_start)
      THEN tsrange(start_date + make_interval(hours => hour_start),
                   end_date + make_interval(hours => hour_end), '[)')
      ELSE tsrange(start_date::timestamp, (end_date + 1)::timestamp, '[)')
    END
  ) STORED,
  CONSTRAINT reservations_dates_check CHECK (end_date >= start_date),
  CONSTRAINT reservations_hours_check CHECK (
    hour_start IS NULL OR hour_end IS NULL OR end_date > start_date OR hour_end > hour_start),
  -- Anti-sobreventa (RF-16, RNF-03): el motor rechaza dos reservas activas que se solapen.
  CONSTRAINT reservations_no_overlap EXCLUDE USING gist (space_id WITH =, booking_period WITH &&)
    WHERE (status IN ('pending', 'confirmed'))
);
COMMENT ON TABLE public.reservations IS 'Reservas de espacios con pago, garantía y estado';

-- ---------- contracts: contratos digitales (RF-24, RF-26) ----------
CREATE TABLE public.contracts (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('ctr'),
  -- Un contrato por reserva; no se borra junto con la reserva.
  reservation_id TEXT NOT NULL UNIQUE REFERENCES public.reservations(id) ON DELETE RESTRICT,
  space_title TEXT NOT NULL,
  space_address TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  tenant_rut TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_rut TEXT NOT NULL,
  total_clp NUMERIC(12,0) NOT NULL CHECK (total_clp >= 0),
  guarantee_deposit_clp NUMERIC(12,0) NOT NULL DEFAULT 0 CHECK (guarantee_deposit_clp >= 0),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  clauses TEXT[] NOT NULL DEFAULT '{}'::TEXT[] CHECK (cardinality(clauses) <= 100),
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contract_hash TEXT NOT NULL CHECK (length(contract_hash) <= 200),
  hash_algorithm TEXT NOT NULL DEFAULT 'legacy' CHECK (length(hash_algorithm) <= 30),
  hash_version TEXT CHECK (hash_version IS NULL OR length(hash_version) <= 30),
  signer_ip TEXT CHECK (signer_ip IS NULL OR length(signer_ip) <= 100),
  price_unit TEXT,
  rental_modality TEXT,
  signature_image TEXT,
  signature_type TEXT DEFAULT 'digital_canvas',
  tenant_signature JSONB,
  pdf_url TEXT CHECK (pdf_url IS NULL OR length(pdf_url) <= 2048),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.contracts IS 'Contratos digitales firmados, inmutables, con resumen SHA-256';

-- ---------- audit_logs: bitácora de solo adición (RF-33, RNF-14) ----------
-- user_id no es llave foránea a propósito: la bitácora se conserva aunque se
-- elimine el usuario y también registra eventos anónimos o del sistema.
CREATE TABLE public.audit_logs (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('aud'),
  action TEXT NOT NULL CHECK (length(action) <= 100),
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

-- ---------- disputes: reclamos y mediación ----------
CREATE TABLE public.disputes (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('dsp'),
  reservation_id TEXT REFERENCES public.reservations(id) ON DELETE SET NULL,
  space_id TEXT REFERENCES public.spaces(id) ON DELETE SET NULL,
  space_title TEXT NOT NULL,
  tenant_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tenant_name TEXT NOT NULL,
  tenant_rut TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_rut TEXT NOT NULL,
  amount_clp NUMERIC(12,0) NOT NULL CHECK (amount_clp >= 0),
  subtotal_clp NUMERIC(12,0),
  security_deposit_clp NUMERIC(12,0),
  platform_fee_clp NUMERIC(12,0),
  problem_category TEXT CHECK (problem_category IS NULL OR length(problem_category) <= 100),
  reason TEXT NOT NULL CHECK (length(reason) <= 4000),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'investigating', 'resolved_refund', 'resolved_owner')),
  resolution_notes TEXT CHECK (resolution_notes IS NULL OR length(resolution_notes) <= 4000),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.disputes IS 'Reclamos y disputas entre arrendatarios y propietarios';

-- ---------- visit_requests: visitas presenciales o virtuales ----------
CREATE TABLE public.visit_requests (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('vis'),
  space_id TEXT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  space_title TEXT NOT NULL,
  space_address TEXT,
  space_image TEXT,
  tenant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_name TEXT NOT NULL,
  tenant_email TEXT NOT NULL,
  tenant_phone TEXT NOT NULL CHECK (length(tenant_phone) <= 30),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_name TEXT NOT NULL,
  owner_rut TEXT,
  visit_date DATE NOT NULL,
  visit_time_slot TEXT NOT NULL CHECK (length(visit_time_slot) <= 50),
  modality TEXT NOT NULL DEFAULT 'presencial' CHECK (modality IN ('presencial', 'virtual')),
  attendees_count INTEGER NOT NULL DEFAULT 1 CHECK (attendees_count BETWEEN 1 AND 50),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.visit_requests IS 'Agendamiento de visitas a los espacios';

-- ---------- notifications: avisos persistentes (RF-34) ----------
CREATE TABLE public.notifications (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('ntf'),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) <= 200),
  message TEXT NOT NULL CHECK (length(message) <= 4000),
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  link TEXT CHECK (link IS NULL OR length(link) <= 500),
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- kyc_verifications: historial de verificación (RF-30/31) ----------
CREATE TABLE public.kyc_verifications (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('kyc'),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'verified', 'rejected')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- login_attempts: bloqueo por intentos fallidos (RNF-04) ----------
-- Sin llave foránea a propósito: registra intentos sobre correos que pueden no
-- existir. El contador es por (correo, IP) y hay un límite global por IP
-- (email = '*'). Solo lo usa el backend (service_role) desde /api/auth.
CREATE TABLE public.login_attempts (
  email TEXT NOT NULL,
  ip TEXT NOT NULL,
  failed_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (email, ip)
);

-- ---------- wallet_cards: billetera con Transbank Oneclick Mall ----------
-- Spotly no guarda números de tarjeta: Transbank entrega un identificador
-- (tbk_user) que solo lee el backend; el cliente ve el tipo y los últimos 4 dígitos.
CREATE TABLE public.wallet_cards (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('crd'),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'failed')),
  environment TEXT NOT NULL DEFAULT 'integration' CHECK (environment IN ('integration', 'production')),
  inscription_token TEXT UNIQUE,
  tbk_user TEXT,
  card_type TEXT CHECK (card_type IS NULL OR length(card_type) <= 30),
  card_last4 TEXT CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  is_default BOOLEAN NOT NULL DEFAULT false,
  return_path TEXT CHECK (return_path IS NULL OR length(return_path) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- payments: pagos Webpay Plus y Oneclick (RF-17) ----------
CREATE TABLE public.payments (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('pay'),
  reservation_id TEXT NOT NULL REFERENCES public.reservations(id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'webpay_plus' CHECK (provider IN ('webpay_plus', 'oneclick_mall')),
  environment TEXT NOT NULL DEFAULT 'integration' CHECK (environment IN ('integration', 'production')),
  buy_order TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  token TEXT UNIQUE,
  amount_clp NUMERIC(12,0) NOT NULL CHECK (amount_clp > 0),
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'authorized', 'failed', 'aborted', 'refunded', 'partially_refunded')),
  response_code INTEGER,
  authorization_code TEXT,
  card_last4 TEXT CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  payment_type_code TEXT,
  installments_number INTEGER,
  transaction_date TIMESTAMPTZ,
  raw_response JSONB,
  refunded_amount_clp NUMERIC(12,0) NOT NULL DEFAULT 0 CHECK (refunded_amount_clp >= 0),
  refund_response JSONB,
  wallet_card_id TEXT REFERENCES public.wallet_cards(id) ON DELETE SET NULL,
  child_commerce_code TEXT,
  child_buy_order TEXT,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payments_refund_not_above_amount CHECK (refunded_amount_clp <= amount_clp)
);

-- ---------- favorites (RF-13) ----------
CREATE TABLE public.favorites (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  space_id TEXT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, space_id)
);

-- ---------- reviews: valoraciones (RF-29, KPI-08) ----------
CREATE TABLE public.reviews (
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

-- ---------- user_reports: reportes de publicaciones y usuarios (RF-32) ----------
CREATE TABLE public.user_reports (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('rpt'),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reporter_email TEXT,
  target_type TEXT NOT NULL CHECK (target_type IN ('space', 'user')),
  target_space_id TEXT REFERENCES public.spaces(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_label TEXT NOT NULL CHECK (length(target_label) <= 300),
  category TEXT NOT NULL CHECK (length(category) <= 100),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 10 AND 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  admin_notes TEXT CHECK (admin_notes IS NULL OR length(admin_notes) <= 2000),
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_reports_target_check CHECK (
    (target_type = 'space' AND target_space_id IS NOT NULL) OR
    (target_type = 'user' AND target_user_id IS NOT NULL)
  )
);

-- ---------- space_views: visitas al detalle (KPI-04) ----------
CREATE TABLE public.space_views (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Clave de deduplicación (usuario o hash de IP) que fija el disparador.
  viewer_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- space_blocks: fechas bloqueadas por el propietario (RF-14) ----------
-- Mantención, uso propio, etc. Bloquean el calendario igual que una reserva.
CREATE TABLE public.space_blocks (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('blk'),
  space_id TEXT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  hour_start INTEGER CHECK (hour_start IS NULL OR hour_start BETWEEN 0 AND 23),
  hour_end INTEGER CHECK (hour_end IS NULL OR hour_end BETWEEN 1 AND 24),
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  block_period tsrange GENERATED ALWAYS AS (
    CASE
      WHEN hour_start IS NOT NULL AND hour_end IS NOT NULL
           AND (end_date > start_date OR hour_end > hour_start)
      THEN tsrange(start_date + make_interval(hours => hour_start),
                   end_date + make_interval(hours => hour_end), '[)')
      ELSE tsrange(start_date::timestamp, (end_date + 1)::timestamp, '[)')
    END
  ) STORED,
  CONSTRAINT space_blocks_dates_check CHECK (end_date >= start_date),
  CONSTRAINT space_blocks_hours_check CHECK (
    hour_start IS NULL OR hour_end IS NULL OR end_date > start_date OR hour_end > hour_start)
);
COMMENT ON TABLE public.space_blocks IS 'Períodos en que el propietario bloquea su espacio';

-- ---------- owner_payouts: liquidaciones al propietario ----------
-- Se generan al finalizar la reserva: el propietario recibe el arriendo menos el
-- descuento (la comisión queda en Spotly; la garantía vuelve al arrendatario).
CREATE TABLE public.owner_payouts (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('pyo'),
  reservation_id TEXT NOT NULL UNIQUE REFERENCES public.reservations(id) ON DELETE RESTRICT,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  gross_clp NUMERIC(12,0) NOT NULL CHECK (gross_clp >= 0),
  platform_fee_clp NUMERIC(12,0) NOT NULL DEFAULT 0 CHECK (platform_fee_clp >= 0),
  discount_clp NUMERIC(12,0) NOT NULL DEFAULT 0 CHECK (discount_clp >= 0),
  amount_clp NUMERIC(12,0) NOT NULL CHECK (amount_clp >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'on_hold', 'cancelled')),
  transfer_reference TEXT CHECK (transfer_reference IS NULL OR length(transfer_reference) <= 200),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.owner_payouts IS 'Liquidaciones de arriendos pagadas a propietarios';

-- ---------- payment_refunds: reembolsos (uno o varios por pago) ----------
CREATE TABLE public.payment_refunds (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('rfd'),
  payment_id TEXT NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  reservation_id TEXT NOT NULL REFERENCES public.reservations(id) ON DELETE RESTRICT,
  amount_clp NUMERIC(12,0) NOT NULL CHECK (amount_clp > 0),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'succeeded', 'failed')),
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 500),
  provider_response JSONB,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.payment_refunds IS 'Reembolsos de Transbank; los escribe solo el backend';

-- ---------- user_consents: registro de consentimientos (Ley 19.628 / 21.719) ----------
CREATE TABLE public.user_consents (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('cns'),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document TEXT NOT NULL CHECK (document IN ('terms', 'privacy', 'owner_terms', 'kyc', 'cookies')),
  version TEXT NOT NULL CHECK (length(version) BETWEEN 1 AND 30),
  accepted BOOLEAN NOT NULL DEFAULT true,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.user_consents IS 'Historial inmutable de aceptación de términos y privacidad';

-- ---------- support_tickets: mesa de ayuda ----------
CREATE TABLE public.support_tickets (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('tkt'),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reservation_id TEXT REFERENCES public.reservations(id) ON DELETE SET NULL,
  subject TEXT NOT NULL CHECK (length(trim(subject)) BETWEEN 3 AND 200),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 10 AND 4000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_reply TEXT CHECK (admin_reply IS NULL OR length(admin_reply) <= 4000),
  replied_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.support_tickets IS 'Solicitudes de soporte de usuarios';

-- La reserva apunta a su contrato (lo fija el disparador de contratos).
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_digital_contract_fk
  FOREIGN KEY (digital_contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;

-- ==============================================================================
-- 5. ÍNDICES Y UNICIDAD (sin índices redundantes)
-- ==============================================================================
-- Unicidad de negocio: evita registros duplicados.
CREATE UNIQUE INDEX profiles_rut_unique ON public.profiles (public.normalize_rut(rut))
  WHERE public.normalize_rut(rut) IS NOT NULL;
CREATE UNIQUE INDEX spaces_owner_title_address_unique
  ON public.spaces (owner_id, lower(trim(title)), lower(trim(address)));
CREATE UNIQUE INDEX visit_requests_no_duplicates
  ON public.visit_requests (tenant_id, space_id, visit_date, visit_time_slot)
  WHERE status IN ('pending', 'confirmed');
CREATE UNIQUE INDEX payments_one_authorized_per_reservation
  ON public.payments (reservation_id) WHERE status IN ('authorized', 'refunded', 'partially_refunded');
CREATE UNIQUE INDEX wallet_cards_one_default
  ON public.wallet_cards (user_id) WHERE is_default AND status = 'active';
CREATE UNIQUE INDEX wallet_cards_no_duplicate_active
  ON public.wallet_cards (user_id, card_type, card_last4) WHERE status = 'active';

-- Catálogo público y paneles.
CREATE INDEX idx_spaces_owner ON public.spaces (owner_id);
CREATE INDEX idx_spaces_active_recent ON public.spaces (created_at DESC) WHERE status = 'active';
CREATE INDEX idx_spaces_status_commune_category ON public.spaces (status, commune, category);
CREATE INDEX idx_spaces_title_trgm ON public.spaces USING gin (title extensions.gin_trgm_ops);

CREATE INDEX idx_reservations_tenant_recent ON public.reservations (tenant_id, created_at DESC);
CREATE INDEX idx_reservations_owner_recent ON public.reservations (owner_id, created_at DESC);
CREATE INDEX idx_reservations_space_status ON public.reservations (space_id, status);
CREATE INDEX idx_reservations_dates ON public.reservations (start_date, end_date);
CREATE INDEX idx_reservations_contract ON public.reservations (digital_contract_id) WHERE digital_contract_id IS NOT NULL;
CREATE INDEX idx_reservations_discount_code ON public.reservations (discount_code) WHERE discount_code IS NOT NULL;
CREATE INDEX idx_reservations_cancelled_by ON public.reservations (cancelled_by) WHERE cancelled_by IS NOT NULL;
CREATE INDEX idx_reservations_pending_payment
  ON public.reservations (space_id, created_at) WHERE status = 'pending' AND payment_status = 'pending';

CREATE INDEX idx_contracts_signed_at ON public.contracts (signed_at DESC);

CREATE INDEX idx_audit_logs_user ON public.audit_logs (user_id);
CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs (timestamp DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX idx_audit_logs_severity_time ON public.audit_logs (severity, timestamp DESC);

CREATE INDEX idx_disputes_reservation ON public.disputes (reservation_id);
CREATE INDEX idx_disputes_space ON public.disputes (space_id);
CREATE INDEX idx_disputes_tenant ON public.disputes (tenant_id);
CREATE INDEX idx_disputes_owner ON public.disputes (owner_id);
CREATE INDEX idx_disputes_status ON public.disputes (status);

CREATE INDEX idx_visit_requests_space_status ON public.visit_requests (space_id, tenant_id, status);
CREATE INDEX idx_visit_requests_tenant ON public.visit_requests (tenant_id);
CREATE INDEX idx_visit_requests_owner ON public.visit_requests (owner_id);
CREATE INDEX idx_visit_requests_date ON public.visit_requests (visit_date);

CREATE INDEX idx_notifications_user ON public.notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications (user_id) WHERE NOT read;

CREATE INDEX idx_kyc_verifications_user ON public.kyc_verifications (user_id, submitted_at DESC);
CREATE INDEX idx_kyc_verifications_resolved ON public.kyc_verifications (resolved_at) WHERE resolved_at IS NOT NULL;
CREATE INDEX idx_kyc_verifications_resolved_by ON public.kyc_verifications (resolved_by) WHERE resolved_by IS NOT NULL;

CREATE INDEX idx_login_attempts_updated ON public.login_attempts (updated_at);

CREATE INDEX idx_wallet_cards_user ON public.wallet_cards (user_id, created_at DESC);

CREATE INDEX idx_payments_reservation ON public.payments (reservation_id);
CREATE INDEX idx_payments_tenant ON public.payments (tenant_id, created_at DESC);
CREATE INDEX idx_payments_wallet_card ON public.payments (wallet_card_id) WHERE wallet_card_id IS NOT NULL;

CREATE INDEX idx_favorites_space ON public.favorites (space_id);

CREATE INDEX idx_reviews_space ON public.reviews (space_id, created_at DESC);
CREATE INDEX idx_reviews_tenant ON public.reviews (tenant_id);

CREATE INDEX idx_user_reports_status ON public.user_reports (status, created_at DESC);
CREATE INDEX idx_user_reports_reporter ON public.user_reports (reporter_id);
CREATE INDEX idx_user_reports_target_space ON public.user_reports (target_space_id) WHERE target_space_id IS NOT NULL;
CREATE INDEX idx_user_reports_target_user ON public.user_reports (target_user_id) WHERE target_user_id IS NOT NULL;
CREATE INDEX idx_user_reports_resolved_by ON public.user_reports (resolved_by) WHERE resolved_by IS NOT NULL;

CREATE INDEX idx_space_views_space ON public.space_views (space_id, created_at DESC);
CREATE INDEX idx_space_views_created ON public.space_views (created_at DESC);
CREATE INDEX idx_space_views_viewer ON public.space_views (viewer_id) WHERE viewer_id IS NOT NULL;
CREATE INDEX idx_space_views_dedupe ON public.space_views (space_id, viewer_key, created_at DESC);

CREATE INDEX idx_space_blocks_space ON public.space_blocks USING gist (space_id, block_period);
CREATE INDEX idx_space_blocks_owner ON public.space_blocks (owner_id);

CREATE INDEX idx_owner_payouts_owner ON public.owner_payouts (owner_id, created_at DESC);
CREATE INDEX idx_owner_payouts_pending ON public.owner_payouts (created_at) WHERE status = 'pending';

CREATE INDEX idx_payment_refunds_payment ON public.payment_refunds (payment_id);
CREATE INDEX idx_payment_refunds_reservation ON public.payment_refunds (reservation_id);
CREATE INDEX idx_payment_refunds_requested_by ON public.payment_refunds (requested_by) WHERE requested_by IS NOT NULL;

CREATE INDEX idx_user_consents_user ON public.user_consents (user_id, document, created_at DESC);

CREATE INDEX idx_support_tickets_user ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX idx_support_tickets_status ON public.support_tickets (status, created_at DESC);
CREATE INDEX idx_support_tickets_reservation ON public.support_tickets (reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX idx_support_tickets_replied_by ON public.support_tickets (replied_by) WHERE replied_by IS NOT NULL;

-- ==============================================================================
-- 6. FUNCIONES DE NEGOCIO Y SEGURIDAD
-- ==============================================================================
-- Todas fijan search_path (evita secuestro de objetos) y ninguna arma SQL
-- dinámico con datos del usuario: los valores se pasan siempre como parámetros,
-- por lo que no hay vía de inyección SQL.

-- ---------- Roles ----------
CREATE FUNCTION public.is_admin()
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

-- ---------- Auditoría (RF-33, RNF-08, RNF-14) ----------
CREATE FUNCTION public.write_audit(
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email TEXT;
  v_role TEXT;
BEGIN
  SELECT email, role INTO v_email, v_role FROM public.profiles WHERE id::text = p_user_id;
  INSERT INTO public.audit_logs (action, user_id, user_email, user_role, severity, details, ip, user_agent)
  VALUES (
    left(p_action, 100),
    COALESCE(p_user_id, 'system'),
    COALESCE(v_email, 'sistema@spotly.cl'),
    COALESCE(v_role, 'system'),
    p_severity,
    COALESCE(p_details, '{}'::jsonb),
    left(p_ip, 100),
    left(p_user_agent, 500)
  );
END;
$$;

CREATE FUNCTION public.audit_logs_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
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

CREATE FUNCTION public.audit_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs es una bitácora de solo adición: no admite %', TG_OP;
END;
$$;

-- ---------- Notificaciones (RF-34) ----------
CREATE FUNCTION public.notify_user(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT DEFAULT 'info',
  p_link TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.notifications (user_id, title, message, type, link)
  VALUES (p_user_id, left(p_title, 200), left(p_message, 4000), p_type, left(p_link, 500));
END;
$$;

-- ---------- Alta y sincronización de perfiles desde Supabase Auth ----------
CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  profile_role TEXT;
  v_birth DATE;
BEGIN
  -- El registro público solo crea arrendatarios o propietarios, nunca administradores.
  profile_role := CASE WHEN NEW.raw_user_meta_data->>'role' = 'owner' THEN 'owner' ELSE 'tenant' END;

  BEGIN
    v_birth := NULLIF(NEW.raw_user_meta_data->>'birth_date', '')::DATE;
  EXCEPTION WHEN OTHERS THEN
    v_birth := NULL;
  END;

  INSERT INTO public.profiles (
    id, full_name, first_names, surnames, email, rut, phone, gender, birth_date,
    role, owner_terms_accepted, verification_status, created_at, updated_at
  )
  VALUES (
    NEW.id,
    left(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Usuario Spotly'), 200),
    left(COALESCE(NEW.raw_user_meta_data->>'first_names', ''), 120),
    left(COALESCE(NEW.raw_user_meta_data->>'surnames', ''), 120),
    NEW.email,
    left(COALESCE(NEW.raw_user_meta_data->>'rut', ''), 15),
    left(COALESCE(NEW.raw_user_meta_data->>'phone', ''), 30),
    CASE WHEN NEW.raw_user_meta_data->>'gender' IN ('masculino', 'femenino', 'no_binario', 'otro', 'prefiero_no_decir')
         THEN NEW.raw_user_meta_data->>'gender' ELSE 'prefiero_no_decir' END,
    v_birth,
    profile_role,
    COALESCE((NEW.raw_user_meta_data->>'owner_terms_accepted')::boolean, false),
    'unverified',
    now(),
    now()
  )
  -- raw_user_meta_data lo controla el usuario (auth.updateUser) y esta ruta corre
  -- sin JWT, así que no pasa por guard_profile_privileged_fields: con la identidad
  -- verificada, nombre, RUT y fecha de nacimiento quedan bloqueados.
  ON CONFLICT (id) DO UPDATE SET
    full_name = CASE WHEN profiles.verification_status = 'verified' THEN profiles.full_name ELSE EXCLUDED.full_name END,
    first_names = CASE WHEN profiles.verification_status = 'verified' THEN profiles.first_names ELSE EXCLUDED.first_names END,
    surnames = CASE WHEN profiles.verification_status = 'verified' THEN profiles.surnames ELSE EXCLUDED.surnames END,
    email = EXCLUDED.email,
    rut = CASE WHEN profiles.verification_status = 'verified' THEN profiles.rut ELSE EXCLUDED.rut END,
    phone = EXCLUDED.phone,
    gender = EXCLUDED.gender,
    birth_date = CASE WHEN profiles.verification_status = 'verified' THEN profiles.birth_date ELSE EXCLUDED.birth_date END,
    updated_at = now();

  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('USER_REGISTERED_SUPABASE', 'security', NEW.id::text,
      jsonb_build_object('ownerTermsAccepted', COALESCE((NEW.raw_user_meta_data->>'owner_terms_accepted')::boolean, false)));
  END IF;

  RETURN NEW;
END;
$$;

-- ---------- Guardas de perfil ----------
-- Evita que un usuario se eleve a admin, altere su KYC o cambie su RUT una vez
-- verificado. La transición tenant -> owner requiere aceptación de términos.
CREATE FUNCTION public.guard_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  valid_manual_submission BOOLEAN;
BEGIN
  -- SQL Editor/service role (sin auth.uid) es el canal administrativo confiable.
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  NEW.created_at := OLD.created_at;

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

  IF OLD.verification_status = 'verified'
     AND public.normalize_rut(NEW.rut) IS DISTINCT FROM public.normalize_rut(OLD.rut) THEN
    RAISE EXCEPTION 'Tu identidad ya fue verificada: para cambiar el RUT contacta a soporte';
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

-- Solo un administrador puede suspender o reactivar cuentas (RF-32).
CREATE FUNCTION public.guard_profile_suspension()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- Historial de verificación de identidad (RF-30/31).
CREATE FUNCTION public.track_kyc_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_open_id TEXT;
  v_submitted TIMESTAMPTZ;
BEGIN
  IF NEW.verification_status IS NOT DISTINCT FROM OLD.verification_status THEN
    RETURN NEW;
  END IF;

  IF NEW.verification_status = 'pending_review' THEN
    BEGIN
      v_submitted := NULLIF(NEW.kyc_data->>'submittedAt', '')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_submitted := NULL;
    END;
    INSERT INTO public.kyc_verifications (user_id, status, submitted_at)
    VALUES (NEW.id, 'pending_review', COALESCE(v_submitted, now()));
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

-- ---------- Bloqueo por intentos fallidos de inicio de sesión (RNF-04) ----------
CREATE FUNCTION public.login_lock_status(p_email TEXT, p_ip TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'locked', COALESCE(max(locked_until) > now(), false),
    'locked_until', CASE WHEN max(locked_until) > now() THEN max(locked_until) END
  )
  FROM public.login_attempts
  WHERE ip = COALESCE(NULLIF(trim(p_ip), ''), 'desconocida')
    AND email IN (lower(trim(p_email)), '*');
$$;

CREATE FUNCTION public.purge_old_login_attempts()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.login_attempts
  WHERE updated_at < now() - interval '1 day'
    AND (locked_until IS NULL OR locked_until < now());
$$;

-- Incrementa un contador con ventana deslizante y lo bloquea al llegar al máximo.
CREATE FUNCTION public.bump_login_counter(p_key TEXT, p_ip TEXT, p_max INTEGER)
RETURNS public.login_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

CREATE FUNCTION public.register_failed_login(p_email TEXT, p_ip TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_per_account CONSTANT INTEGER := 5;
  c_max_per_ip CONSTANT INTEGER := 20;
  v_email TEXT := left(lower(trim(COALESCE(p_email, ''))), 320);
  v_ip TEXT := left(COALESCE(NULLIF(trim(p_ip), ''), 'desconocida'), 100);
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

CREATE FUNCTION public.reset_login_attempts(p_email TEXT, p_ip TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.login_attempts
  WHERE email = lower(trim(p_email)) AND ip = COALESCE(NULLIF(trim(p_ip), ''), 'desconocida');
$$;

-- ---------- Espacios: campos protegidos (RNF-06) ----------
CREATE FUNCTION public.guard_space_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_trusted_context() OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_suspended) THEN
    RAISE EXCEPTION 'Tu cuenta está suspendida: no puedes publicar ni modificar espacios';
  END IF;

  NEW.title := trim(NEW.title);

  -- Nombre y RUT del propietario salen del perfil, no del cliente (se copian
  -- después a reservas y contratos).
  SELECT COALESCE(NULLIF(trim(p.full_name), ''), NEW.owner_name),
         COALESCE(NULLIF(p.rut, ''), NEW.owner_rut)
    INTO NEW.owner_name, NEW.owner_rut
  FROM public.profiles p
  WHERE p.id = CASE WHEN TG_OP = 'INSERT' THEN auth.uid() ELSE OLD.owner_id END;

  IF TG_OP = 'INSERT' THEN
    NEW.owner_id := auth.uid();
    IF EXISTS (
      SELECT 1 FROM public.spaces s
      WHERE s.owner_id = NEW.owner_id
        AND lower(trim(s.title)) = lower(NEW.title)
        AND lower(trim(s.address)) = lower(trim(NEW.address))
    ) THEN
      RAISE EXCEPTION 'Ya publicaste un espacio con el mismo nombre y dirección';
    END IF;
    -- Toda publicación nueva pasa por moderación y parte sin valoraciones.
    NEW.status := 'pending_approval';
    NEW.is_verified := false;
    NEW.rating := 0;
    NEW.reviews_count := 0;
    NEW.created_at := now();
    NEW.owner_verified := COALESCE(
      (SELECT verification_status = 'verified' FROM public.profiles WHERE id = auth.uid()), false);
  ELSE
    -- La reputación y la verificación solo las cambia el sistema o un admin.
    NEW.rating := OLD.rating;
    NEW.reviews_count := OLD.reviews_count;
    NEW.is_verified := OLD.is_verified;
    NEW.owner_verified := OLD.owner_verified;
    NEW.owner_id := OLD.owner_id;
    NEW.created_at := OLD.created_at;
    -- El propietario puede pausar/reactivar una publicación aprobada, pero no autoaprobarse.
    IF OLD.status = 'pending_approval' AND NEW.status = 'active' THEN
      NEW.status := OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Un espacio con historial (reservas) no se borra: se pausa. Mensaje claro en vez
-- del error genérico de llave foránea.
CREATE FUNCTION public.guard_space_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.reservations r WHERE r.space_id = OLD.id) THEN
    RAISE EXCEPTION 'Este espacio tiene reservas registradas: no se puede eliminar, solo pausar';
  END IF;
  RETURN OLD;
END;
$$;

-- ---------- Descuentos (RF-21) ----------
-- Calcula el descuento aplicable sobre el subtotal (no sobre comisión ni garantía).
CREATE FUNCTION public.compute_discount(p_code TEXT, p_subtotal NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v public.discount_codes;
  v_amount NUMERIC;
BEGIN
  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN jsonb_build_object('valid', false, 'discount_clp', 0, 'message', 'Sin código');
  END IF;

  SELECT * INTO v FROM public.discount_codes WHERE code = upper(trim(left(p_code, 30)));
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

  v_amount := round(GREATEST(COALESCE(p_subtotal, 0), 0) * v.percent_off / 100.0);
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

-- ---------- Reservas: retención de pago, montos, cancelación y reembolso ----------
-- Libera bloques retenidos por pagos que no se completaron (20 minutos).
CREATE FUNCTION public.release_expired_payment_holds(p_space_id TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
  v_prev TEXT := public.begin_trusted();
BEGIN
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
  PERFORM public.end_trusted(v_prev);
  RETURN v_count;
END;
$$;

-- Montos esperados según la tarifa publicada (misma regla que src/utils/pricing.ts):
-- subtotal + comisión 5 %; la garantía solo se cobra en arriendos mensuales y solo
-- si el propietario la exige.
CREATE FUNCTION public.expected_reservation_amounts(
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
SET search_path = public, pg_temp
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
    v_price := NULLIF(p_space.price_per_hour, 0);
  ELSIF p_price_unit = 'month' THEN
    v_units := GREATEST(ceil(v_days / 30.0)::int, 1);
    v_price := NULLIF(p_space.price_per_month, 0);
  ELSE
    v_units := GREATEST(v_days, 1);
    v_price := p_space.price_per_day;
  END IF;

  -- Sin tarifa publicada para la modalidad no hay precio que cobrar.
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'El espacio no tiene tarifa publicada para esta modalidad de arriendo';
  END IF;

  v_subtotal := v_units * v_price;
  v_fee := round(v_subtotal * 0.05);
  v_deposit := CASE
    WHEN p_price_unit = 'month' AND COALESCE(p_space.security_deposit, 0) > 0 THEN round(p_space.security_deposit)
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'units', v_units,
    'subtotal', v_subtotal,
    'platform_fee', v_fee,
    'deposit', v_deposit
  );
END;
$$;

CREATE FUNCTION public.guard_reservation_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  IF v_space.owner_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes reservar un espacio que tú publicaste';
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

  -- Fechas bloqueadas por el propietario.
  IF EXISTS (
    SELECT 1 FROM public.space_blocks b
    WHERE b.space_id = NEW.space_id
      AND b.block_period && public.period_range(NEW.start_date, NEW.end_date, NEW.hour_start, NEW.hour_end)
  ) THEN
    RAISE EXCEPTION 'El propietario bloqueó esas fechas: elige otro horario';
  END IF;

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
  -- no pueden usar el último cupo.
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

  -- Datos que el cliente no puede falsear: identidad del arrendatario y del espacio.
  IF NOT public.is_admin() THEN
    SELECT left(COALESCE(NULLIF(trim(p.full_name), ''), NEW.tenant_name), 200), p.email,
           COALESCE(NULLIF(p.rut, ''), NEW.tenant_rut)
      INTO NEW.tenant_name, NEW.tenant_email, NEW.tenant_rut
    FROM public.profiles p WHERE p.id = auth.uid();
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
  NEW.dispute_status := 'none';
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

-- Política de cancelación (RF-18), misma regla que src/utils/refundPolicy.ts:
--   ≥ 48 h antes del inicio: 100 % del arriendo pagado + garantía
--   24–48 h antes:            50 % del arriendo pagado + garantía
--   < 24 h antes:              solo la garantía
--   La comisión no es reembolsable, salvo que cancele el propietario o el
--   administrador, o que el propietario rechace la solicitud (100 % del total).
CREATE FUNCTION public.compute_refund(
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
  IF v_hours >= 48 THEN
    RETURN v_rent + p_res.security_deposit_clp;
  ELSIF v_hours >= 24 THEN
    RETURN round(v_rent * 0.5) + p_res.security_deposit_clp;
  ELSE
    RETURN p_res.security_deposit_clp;
  END IF;
END;
$$;

CREATE FUNCTION public.guard_reservation_update()
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

-- Auditoría y notificaciones de reservas generadas por el servidor.
CREATE FUNCTION public.reservation_events()
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
    IF NEW.status = 'completed' AND NEW.payment_status IN ('paid', 'partially_refunded') THEN
      INSERT INTO public.owner_payouts (reservation_id, owner_id, gross_clp, platform_fee_clp, discount_clp, amount_clp)
      VALUES (NEW.id, NEW.owner_id, NEW.subtotal_clp, NEW.platform_fee_clp, NEW.discount_clp,
              GREATEST(NEW.subtotal_clp - NEW.discount_clp, 0))
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

-- Ocupación pública de un espacio (sin datos personales) para el calendario (RF-14).
CREATE FUNCTION public.get_space_occupancy(p_space_id TEXT)
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
SET search_path = public, pg_temp
AS $$
  SELECT r.start_date, r.end_date, r.hour_start, r.hour_end, r.rental_modality,
         r.duration_units, r.total_days, r.status
  FROM public.reservations r
  JOIN public.spaces s ON s.id = r.space_id AND s.status = 'active'
  WHERE r.space_id = p_space_id
    AND r.status IN ('pending', 'confirmed')
    AND r.end_date >= public.chile_today() - 1
    -- Las retenciones de pago vencidas ya no ocupan el calendario.
    AND NOT (r.status = 'pending' AND r.payment_status = 'pending' AND r.created_at < now() - interval '20 minutes')
  UNION ALL
  SELECT b.start_date, b.end_date, b.hour_start, b.hour_end,
         CASE WHEN b.hour_start IS NOT NULL THEN 'por_hora' ELSE 'por_dia' END,
         NULL::numeric, (b.end_date - b.start_date) + 1, 'blocked'
  FROM public.space_blocks b
  JOIN public.spaces s ON s.id = b.space_id AND s.status = 'active'
  WHERE b.space_id = p_space_id
    AND b.end_date >= public.chile_today() - 1;
$$;

-- Dirección exacta y RUT del propietario: solo para el propietario, administración
-- y quien tiene una reserva o visita en el espacio.
CREATE FUNCTION public.get_spaces_private_details()
RETURNS TABLE (space_id TEXT, owner_rut TEXT, address TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
     -- Solo visitas que el propietario aceptó (una solicitud pendiente no basta).
     OR EXISTS (
       SELECT 1 FROM public.visit_requests v
       WHERE v.space_id = s.id
         AND v.tenant_id = auth.uid()
         AND v.status IN ('confirmed', 'completed')
     );
$$;

-- ---------- Visitas: datos confiables y transiciones ----------
CREATE FUNCTION public.guard_visit_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_space public.spaces;
  v_tenant BOOLEAN;
  v_owner BOOLEAN;
BEGIN
  IF public.is_trusted_context() OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_suspended) THEN
      RAISE EXCEPTION 'Tu cuenta está suspendida: no puedes agendar visitas';
    END IF;
    SELECT * INTO v_space FROM public.spaces WHERE id = NEW.space_id;
    IF NOT FOUND OR v_space.status <> 'active' THEN
      RAISE EXCEPTION 'El espacio no está disponible para visitas';
    END IF;
    IF v_space.owner_id = auth.uid() THEN
      RAISE EXCEPTION 'No puedes agendar una visita a tu propio espacio';
    END IF;
    IF NEW.visit_date < public.chile_today() THEN
      RAISE EXCEPTION 'La fecha de la visita debe ser desde hoy en adelante';
    END IF;

    NEW.tenant_id := auth.uid();
    SELECT left(COALESCE(NULLIF(trim(p.full_name), ''), NEW.tenant_name), 200), p.email,
           COALESCE(NULLIF(NEW.tenant_phone, ''), NULLIF(p.phone, ''), '')
      INTO NEW.tenant_name, NEW.tenant_email, NEW.tenant_phone
    FROM public.profiles p WHERE p.id = auth.uid();
    NEW.owner_id := v_space.owner_id;
    NEW.owner_name := v_space.owner_name;
    NEW.owner_rut := v_space.owner_rut;
    NEW.space_title := v_space.title;
    -- La dirección exacta se entrega cuando el propietario acepta la visita.
    NEW.space_address := v_space.commune || ', ' || v_space.region;
    NEW.space_image := COALESCE(v_space.images[1], NEW.space_image);
    NEW.status := 'pending';
    NEW.created_at := now();
    RETURN NEW;
  END IF;

  -- UPDATE: los datos de la visita son inmutables; solo cambia el estado.
  v_tenant := auth.uid() = OLD.tenant_id;
  v_owner := auth.uid() = OLD.owner_id;
  IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'Solo se puede cambiar el estado de la visita';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'confirmed') AND (v_tenant OR v_owner) THEN
      NULL;
    ELSIF NEW.status IN ('confirmed', 'completed') AND v_owner
          AND OLD.status IN ('pending', 'confirmed') THEN
      IF NEW.status = 'confirmed' THEN
        PERFORM public.notify_user(OLD.tenant_id, 'Visita confirmada',
          format('El propietario confirmó tu visita a "%s" el %s (%s).', OLD.space_title, OLD.visit_date, OLD.visit_time_slot),
          'success', '/space/' || OLD.space_id);
      END IF;
    ELSE
      RAISE EXCEPTION 'Transición de estado de visita no permitida';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.visit_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.notify_user(NEW.owner_id, 'Nueva solicitud de visita',
    format('%s quiere visitar "%s" el %s (%s). Acéptala o recházala desde tu panel.',
           NEW.tenant_name, NEW.space_title, NEW.visit_date, NEW.visit_time_slot),
    'info', '/owner');
  RETURN NEW;
END;
$$;

-- ---------- Disputas: solo las partes, con datos tomados de la reserva ----------
CREATE FUNCTION public.guard_dispute_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res public.reservations;
  v_prev TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND NOT public.is_trusted_context() AND NOT public.is_admin() THEN
    SELECT * INTO v_res FROM public.reservations WHERE id = NEW.reservation_id;
    IF NOT FOUND OR auth.uid() NOT IN (v_res.tenant_id, v_res.owner_id) THEN
      RAISE EXCEPTION 'Solo las partes de la reserva pueden abrir una disputa';
    END IF;
    NEW.space_id := v_res.space_id;
    NEW.space_title := v_res.space_title;
    NEW.tenant_id := v_res.tenant_id;
    NEW.tenant_name := v_res.tenant_name;
    NEW.tenant_rut := v_res.tenant_rut;
    NEW.owner_id := v_res.owner_id;
    NEW.owner_name := v_res.owner_name;
    NEW.owner_rut := COALESCE(v_res.owner_rut, '');
    NEW.amount_clp := v_res.total_clp;
    NEW.subtotal_clp := v_res.subtotal_clp;
    NEW.security_deposit_clp := v_res.security_deposit_clp;
    NEW.platform_fee_clp := v_res.platform_fee_clp;
    NEW.status := 'pending';
    NEW.resolution_notes := NULL;
    NEW.resolved_at := NULL;
    NEW.created_at := now();
  ELSIF TG_OP = 'INSERT' AND NEW.owner_id IS NULL AND NEW.reservation_id IS NOT NULL THEN
    SELECT owner_id INTO NEW.owner_id FROM public.reservations WHERE id = NEW.reservation_id;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('resolved_refund', 'resolved_owner') THEN
    NEW.resolved_at := COALESCE(NEW.resolved_at, now());
  END IF;

  -- Sincroniza el estado de disputa de la reserva (fuente de verdad: disputes).
  IF NEW.reservation_id IS NOT NULL THEN
    v_prev := public.begin_trusted();
    UPDATE public.reservations
    SET dispute_status = CASE NEW.status
          WHEN 'pending' THEN 'opened'
          WHEN 'investigating' THEN 'in_review'
          ELSE 'resolved' END,
        dispute_reason = COALESCE(dispute_reason, left(NEW.reason, 4000))
    WHERE id = NEW.reservation_id;
    PERFORM public.end_trusted(v_prev);
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- Valoraciones: el nombre del autor sale del perfil ----------
CREATE FUNCTION public.guard_review_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_trusted_context() OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  SELECT left(COALESCE(NULLIF(trim(full_name), ''), NEW.tenant_name), 200) INTO NEW.tenant_name
  FROM public.profiles WHERE id = auth.uid();
  NEW.owner_reply := NULL;
  NEW.owner_replied_at := NULL;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

-- ---------- Visitas al detalle: una por visitante cada 30 minutos (KPI-04) ----------
CREATE FUNCTION public.dedupe_space_view()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.viewer_key := COALESCE(NEW.viewer_id::text, md5(COALESCE(public.request_ip(), 'sin-ip')));
  NEW.created_at := now();
  IF EXISTS (
    SELECT 1 FROM public.space_views v
    WHERE v.space_id = NEW.space_id AND v.viewer_key = NEW.viewer_key
      AND v.created_at > now() - interval '30 minutes'
  ) THEN
    RETURN NULL;  -- se descarta en silencio
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- Bloqueos de calendario del propietario ----------
CREATE FUNCTION public.guard_space_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  SELECT owner_id INTO NEW.owner_id FROM public.spaces WHERE id = NEW.space_id;
  IF NEW.owner_id IS NULL THEN
    RAISE EXCEPTION 'El espacio no existe';
  END IF;
  IF NOT (public.is_trusted_context() OR public.is_admin() OR NEW.owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Solo el propietario puede bloquear fechas de su espacio';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.space_id = NEW.space_id AND r.status IN ('pending', 'confirmed')
      AND r.booking_period && public.period_range(NEW.start_date, NEW.end_date, NEW.hour_start, NEW.hour_end)
  ) THEN
    RAISE EXCEPTION 'Ya hay reservas activas en ese período; cancélalas antes de bloquearlo';
  END IF;
  NEW.created_at := COALESCE(NEW.created_at, now());
  RETURN NEW;
END;
$$;

-- ---------- Consentimientos: IP y agente fijados por la base; inmutables ----------
CREATE FUNCTION public.consents_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.ip := left(COALESCE(public.request_ip(), NEW.ip), 100);
  NEW.user_agent := COALESCE(public.request_user_agent(), left(NEW.user_agent, 500));
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

-- ---------- Soporte ----------
CREATE FUNCTION public.guard_support_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_trusted_context() THEN
      NEW.user_id := auth.uid();
    END IF;
    NEW.status := 'open';
    NEW.admin_reply := NULL;
    NEW.replied_by := NULL;
    NEW.replied_at := NULL;
    NEW.created_at := now();
    RETURN NEW;
  END IF;

  IF NOT (public.is_trusted_context() OR public.is_admin()) THEN
    -- El usuario solo puede cerrar su ticket.
    IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at')
       OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'closed') THEN
      RAISE EXCEPTION 'Solo puedes cerrar tu solicitud de soporte';
    END IF;
  ELSIF NEW.admin_reply IS DISTINCT FROM OLD.admin_reply THEN
    NEW.replied_by := auth.uid();
    NEW.replied_at := now();
    PERFORM public.notify_user(NEW.user_id, 'Respuesta de soporte',
      format('Respondimos tu solicitud "%s".', NEW.subject), 'info', '/support');
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- Derecho de supresión: anonimizar una cuenta ----------
-- Las reservas, pagos y contratos se conservan por obligación legal y tributaria;
-- se eliminan los datos personales del perfil y lo que no tiene valor legal.
CREATE FUNCTION public.admin_anonymize_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev TEXT;
BEGIN
  IF NOT (public.is_admin() OR public.is_trusted_context()) THEN
    RAISE EXCEPTION 'Solo un administrador puede anonimizar cuentas';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes anonimizar tu propia cuenta';
  END IF;

  v_prev := public.begin_trusted();
  UPDATE public.spaces SET status = 'paused' WHERE owner_id = p_user_id AND status <> 'paused';
  UPDATE public.profiles
  SET full_name = 'Usuario eliminado',
      first_names = NULL, surnames = NULL,
      email = 'eliminado+' || replace(p_user_id::text, '-', '') || '@spotly.invalid',
      phone = NULL, avatar_url = NULL, birth_date = NULL, gender = 'prefiero_no_decir',
      kyc_data = '{}'::jsonb, commune = NULL, city = NULL,
      is_suspended = true, suspended_reason = 'Cuenta anonimizada a solicitud del titular'
  WHERE id = p_user_id;
  DELETE FROM public.favorites WHERE user_id = p_user_id;
  DELETE FROM public.notifications WHERE user_id = p_user_id;
  DELETE FROM public.wallet_cards WHERE user_id = p_user_id;
  PERFORM public.end_trusted(v_prev);

  PERFORM public.write_audit('ADMIN_USER_ANONYMIZED', 'critical', COALESCE(auth.uid()::text, 'system'),
    jsonb_build_object('targetUserId', p_user_id));
END;
$$;

-- ---------- Mantenimiento periódico (pg_cron) ----------
CREATE FUNCTION public.run_maintenance()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.release_expired_payment_holds(NULL);
  PERFORM public.purge_old_login_attempts();
  DELETE FROM public.space_views WHERE created_at < now() - interval '400 days';
  DELETE FROM public.notifications WHERE read AND created_at < now() - interval '180 days';
END;
$$;

-- ---------- Pagos (Webpay Plus y Oneclick) ----------
CREATE FUNCTION public.payment_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_channel TEXT := CASE WHEN NEW.provider = 'oneclick_mall' THEN 'tu tarjeta guardada (Oneclick)' ELSE 'Webpay Plus' END;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  PERFORM public.write_audit(
    'PAYMENT_' || upper(NEW.status),
    CASE WHEN NEW.status IN ('failed', 'aborted') THEN 'warning' ELSE 'security' END,
    NEW.tenant_id::text,
    jsonb_build_object('paymentId', NEW.id, 'reservationId', NEW.reservation_id, 'buyOrder', NEW.buy_order,
                       'provider', NEW.provider, 'amountClp', NEW.amount_clp, 'responseCode', NEW.response_code,
                       'authorizationCode', NEW.authorization_code, 'refundedClp', NEW.refunded_amount_clp)
  );

  IF NEW.status = 'authorized' THEN
    PERFORM public.notify_user(NEW.tenant_id, 'Pago aprobado',
      format('Transbank aprobó tu pago de $%s CLP con %s (autorización %s).',
             to_char(NEW.amount_clp, 'FM999G999G999'), v_channel, NEW.authorization_code),
      'success', '/my-bookings');
  ELSIF NEW.status IN ('failed', 'aborted') THEN
    PERFORM public.notify_user(NEW.tenant_id, 'Pago no completado',
      'El pago fue rechazado o anulado. El horario quedó liberado y no se realizó ningún cargo.',
      'warning', '/my-bookings');
  ELSIF NEW.status IN ('refunded', 'partially_refunded') THEN
    PERFORM public.notify_user(NEW.tenant_id, 'Reembolso procesado',
      format('Se reversaron $%s CLP a tu medio de pago.', to_char(NEW.refunded_amount_clp, 'FM999G999G999')),
      'success', '/my-bookings');
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- Contratos: SHA-256 e IP del firmante (RF-24, RF-26) ----------
CREATE FUNCTION public.contracts_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res public.reservations;
BEGIN
  NEW.signer_ip := left(COALESCE(public.request_ip(), NEW.signer_ip), 100);
  NEW.created_at := now();
  -- El contrato debe corresponder a la reserva (no se reescriben campos porque el
  -- hash SHA-256 se calcula en el cliente sobre este contenido).
  IF NOT public.is_trusted_context() AND NOT public.is_admin() THEN
    SELECT * INTO v_res FROM public.reservations WHERE id = NEW.reservation_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La reserva del contrato no existe';
    END IF;
    IF NEW.start_date <> v_res.start_date OR NEW.end_date <> v_res.end_date
       OR abs(NEW.total_clp - v_res.total_clp) > 1
       OR public.normalize_rut(NEW.tenant_rut) IS DISTINCT FROM public.normalize_rut(v_res.tenant_rut) THEN
      RAISE EXCEPTION 'El contrato no coincide con la reserva (fechas, total o RUT del arrendatario)';
    END IF;
  END IF;
  IF NEW.hash_algorithm = 'SHA-256' AND NEW.contract_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'El hash del contrato debe ser un SHA-256 hexadecimal de 64 caracteres';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.contracts_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_trusted_context() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION '% es inmutable: no admite %', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE FUNCTION public.contract_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev TEXT := public.begin_trusted();
BEGIN
  UPDATE public.reservations SET digital_contract_id = NEW.id WHERE id = NEW.reservation_id;
  PERFORM public.end_trusted(v_prev);
  PERFORM public.write_audit('CONTRACT_SIGNED', 'security', COALESCE(auth.uid()::text, 'system'),
    jsonb_build_object('contractId', NEW.id, 'reservationId', NEW.reservation_id,
                       'hash', NEW.contract_hash, 'algorithm', NEW.hash_algorithm, 'signerIp', NEW.signer_ip));
  RETURN NEW;
END;
$$;

-- ---------- Valoraciones (RF-29) ----------
CREATE FUNCTION public.guard_review_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

CREATE FUNCTION public.refresh_space_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_space TEXT := COALESCE(NEW.space_id, OLD.space_id);
  v_owner UUID;
  v_prev TEXT := public.begin_trusted();
BEGIN
  UPDATE public.spaces s
  SET rating = COALESCE((SELECT round(avg(rating)::numeric, 1) FROM public.reviews WHERE space_id = v_space), 0),
      reviews_count = (SELECT count(*) FROM public.reviews WHERE space_id = v_space)
  WHERE s.id = v_space
  RETURNING owner_id INTO v_owner;
  PERFORM public.end_trusted(v_prev);

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(v_owner, 'Nueva valoración',
      format('%s calificó tu espacio con %s/5. Puedes responder desde el detalle de la publicación.', NEW.tenant_name, NEW.rating),
      'info', '/space/' || v_space);
  END IF;
  RETURN NULL;
END;
$$;

-- ---------- Reportes y suspensión (RF-32) ----------
CREATE FUNCTION public.report_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'open';
    NEW.created_at := now();
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

CREATE FUNCTION public.admin_set_user_suspension(p_user_id UUID, p_suspend BOOLEAN, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede suspender cuentas';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes suspender tu propia cuenta';
  END IF;

  UPDATE public.profiles
  SET is_suspended = p_suspend,
      suspended_reason = CASE WHEN p_suspend THEN left(NULLIF(trim(p_reason), ''), 1000) END
  WHERE id = p_user_id;

  IF p_suspend THEN
    -- Las publicaciones del usuario suspendido se pausan.
    v_prev := public.begin_trusted();
    UPDATE public.spaces SET status = 'paused' WHERE owner_id = p_user_id AND status = 'active';
    PERFORM public.end_trusted(v_prev);
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

-- ---------- Auditoría de eventos de negocio (RF-33) ----------
CREATE FUNCTION public.audit_entity_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- ---------- Tablero de KPI (Capítulo XI) ----------
CREATE FUNCTION public.admin_kpis(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_hours_per_day CONSTANT NUMERIC := 12; -- horario operativo publicado (08:00–20:00)
  v_days INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 1), 3650);
  v_from TIMESTAMPTZ;
  v_prev_from TIMESTAMPTZ;
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

  v_from := now() - make_interval(days => v_days);
  v_prev_from := now() - make_interval(days => v_days * 2);

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
    THEN round(100 * v_booked_hours / (v_active_spaces * v_days * c_hours_per_day), 1) END;
  v_prev_occupancy := CASE WHEN v_active_spaces > 0
    THEN round(100 * v_prev_booked_hours / (v_active_spaces * v_days * c_hours_per_day), 1) END;

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
    'period_days', v_days,
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

-- ==============================================================================
-- 7. DISPARADORES (TRIGGERS)
-- ==============================================================================
-- Supabase Auth -> perfiles
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF raw_user_meta_data, email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- profiles
CREATE TRIGGER guard_profiles_privileged_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_fields();
CREATE TRIGGER guard_profiles_suspension
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_suspension();
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
CREATE TRIGGER track_profiles_kyc_status
  AFTER UPDATE OF verification_status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.track_kyc_status();
CREATE TRIGGER audit_profiles_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_entity_changes();

-- spaces
CREATE TRIGGER guard_spaces_write
  BEFORE INSERT OR UPDATE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_space_write();
CREATE TRIGGER set_spaces_updated_at
  BEFORE UPDATE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
CREATE TRIGGER audit_spaces_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.audit_entity_changes();
CREATE TRIGGER guard_spaces_delete
  BEFORE DELETE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_space_delete();

-- space_blocks
CREATE TRIGGER guard_space_blocks_write
  BEFORE INSERT OR UPDATE ON public.space_blocks
  FOR EACH ROW EXECUTE FUNCTION public.guard_space_block();

-- visit_requests
CREATE TRIGGER guard_visit_requests_write
  BEFORE INSERT OR UPDATE ON public.visit_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_visit_write();
CREATE TRIGGER visit_requests_events
  AFTER INSERT ON public.visit_requests
  FOR EACH ROW EXECUTE FUNCTION public.visit_events();

-- space_views
CREATE TRIGGER space_views_dedupe
  BEFORE INSERT ON public.space_views
  FOR EACH ROW EXECUTE FUNCTION public.dedupe_space_view();

-- owner_payouts / payment_refunds / support_tickets
CREATE TRIGGER set_owner_payouts_updated_at
  BEFORE UPDATE ON public.owner_payouts
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
CREATE TRIGGER set_payment_refunds_updated_at
  BEFORE UPDATE ON public.payment_refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
CREATE TRIGGER guard_support_tickets_write
  BEFORE INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.guard_support_ticket();
CREATE TRIGGER set_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- user_consents (solo adición)
CREATE TRIGGER user_consents_set_request_metadata
  BEFORE INSERT ON public.user_consents
  FOR EACH ROW EXECUTE FUNCTION public.consents_before_insert();
CREATE TRIGGER user_consents_no_update_delete
  BEFORE UPDATE OR DELETE ON public.user_consents
  FOR EACH ROW EXECUTE FUNCTION public.contracts_immutable();

-- reservations
CREATE TRIGGER guard_reservations_insert
  BEFORE INSERT ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.guard_reservation_insert();
CREATE TRIGGER guard_reservations_update
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.guard_reservation_update();
CREATE TRIGGER set_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
CREATE TRIGGER reservations_events
  AFTER INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.reservation_events();

-- contracts
CREATE TRIGGER contracts_set_request_metadata
  BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_before_insert();
CREATE TRIGGER contracts_no_update_delete
  BEFORE UPDATE OR DELETE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_immutable();
CREATE TRIGGER contracts_events
  AFTER INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contract_events();

-- audit_logs
CREATE TRIGGER audit_logs_set_request_metadata
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_before_insert();
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_append_only();

-- disputes
CREATE TRIGGER guard_disputes_write
  BEFORE INSERT OR UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.guard_dispute_write();
CREATE TRIGGER audit_disputes_changes
  AFTER INSERT OR UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.audit_entity_changes();

-- payments
CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
CREATE TRIGGER payments_events
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payment_events();

-- wallet_cards
CREATE TRIGGER set_wallet_cards_updated_at
  BEFORE UPDATE ON public.wallet_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- reviews
CREATE TRIGGER guard_reviews_insert
  BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_review_insert();
CREATE TRIGGER guard_reviews_update
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_review_update();
CREATE TRIGGER reviews_refresh_rating
  AFTER INSERT OR UPDATE OF rating OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_space_rating();

-- user_reports
CREATE TRIGGER user_reports_events
  BEFORE INSERT OR UPDATE ON public.user_reports
  FOR EACH ROW EXECUTE FUNCTION public.report_events();

-- ==============================================================================
-- 8. SEGURIDAD POR FILAS (RLS): cada usuario solo ve y modifica lo suyo
-- ==============================================================================
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spaces            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_codes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts    ENABLE ROW LEVEL SECURITY;  -- sin políticas: solo backend
ALTER TABLE public.wallet_cards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_views       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_blocks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_payouts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_refunds   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_consents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets   ENABLE ROW LEVEL SECURITY;

-- ---------- profiles ----------
-- El alta la hace el disparador desde auth.users (no hay política de INSERT).
CREATE POLICY "Lectura de perfil propio o administrador"
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id OR (SELECT public.is_admin()));
CREATE POLICY "Actualización de perfil propio o admin"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT auth.uid()) = id OR (SELECT public.is_admin()));

-- ---------- spaces ----------
CREATE POLICY "Lectura pública de espacios activos"
  ON public.spaces FOR SELECT TO anon, authenticated
  USING (status = 'active' OR (SELECT auth.uid()) = owner_id OR (SELECT public.is_admin()));
CREATE POLICY "Propietarios pueden crear espacios"
  ON public.spaces FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_admin()) OR (
      (SELECT auth.uid()) = owner_id AND EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'owner'
      )
    )
  );
CREATE POLICY "Propietarios pueden actualizar sus espacios"
  ON public.spaces FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = owner_id OR (SELECT public.is_admin()))
  WITH CHECK (
    (SELECT public.is_admin()) OR (
      (SELECT auth.uid()) = owner_id AND EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'owner'
      )
    )
  );
CREATE POLICY "Propietarios pueden eliminar sus espacios"
  ON public.spaces FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = owner_id OR (SELECT public.is_admin()));

-- ---------- discount_codes (la validación pública se hace con compute_discount) ----------
CREATE POLICY "Administración de códigos de descuento"
  ON public.discount_codes FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

-- ---------- reservations ----------
CREATE POLICY "Partes de la reserva o admin pueden verla"
  ON public.reservations FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = tenant_id OR (SELECT auth.uid()) = owner_id OR (SELECT public.is_admin()));
CREATE POLICY "Inquilinos pueden solicitar reservas"
  ON public.reservations FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = tenant_id OR (SELECT public.is_admin()));
CREATE POLICY "Partes o admin pueden actualizar estado de reserva"
  ON public.reservations FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = tenant_id OR (SELECT auth.uid()) = owner_id OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT auth.uid()) = tenant_id OR (SELECT auth.uid()) = owner_id OR (SELECT public.is_admin()));

-- ---------- contracts (inmutables tras la firma) ----------
CREATE POLICY "Partes de contrato o admin pueden leerlo"
  ON public.contracts FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = contracts.reservation_id
        AND (r.tenant_id = (SELECT auth.uid()) OR r.owner_id = (SELECT auth.uid()))
    )
  );
CREATE POLICY "Inserción de contratos"
  ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND (r.tenant_id = (SELECT auth.uid()) OR r.owner_id = (SELECT auth.uid()))
    )
  );

-- ---------- audit_logs (solo lectura; se escribe únicamente desde el servidor) ----------
CREATE POLICY "Lectura de auditoría propia o admin"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())::text OR (SELECT public.is_admin()));

-- ---------- disputes ----------
CREATE POLICY "Partes de disputa o admin pueden leerla"
  ON public.disputes FOR SELECT TO authenticated
  USING (tenant_id = (SELECT auth.uid()) OR owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY "Creación de disputas"
  ON public.disputes FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_admin()) OR
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND (r.tenant_id = (SELECT auth.uid()) OR r.owner_id = (SELECT auth.uid()))
    )
  );
CREATE POLICY "Resolución de disputas por admin"
  ON public.disputes FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

-- ---------- visit_requests ----------
CREATE POLICY "Partes de visita pueden ver la solicitud"
  ON public.visit_requests FOR SELECT TO authenticated
  USING (tenant_id = (SELECT auth.uid()) OR owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY "Creación de solicitud de visita"
  ON public.visit_requests FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY "Actualización de visita"
  ON public.visit_requests FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT auth.uid()) OR owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
  WITH CHECK (tenant_id = (SELECT auth.uid()) OR owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- ---------- notifications ----------
CREATE POLICY "Notificaciones propias"
  ON public.notifications FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Crear notificaciones propias"
  ON public.notifications FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Marcar notificaciones propias"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Eliminar notificaciones propias"
  ON public.notifications FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- ---------- kyc_verifications ----------
CREATE POLICY "KYC propio o admin"
  ON public.kyc_verifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- ---------- wallet_cards (escrituras solo desde /api/wallet) ----------
CREATE POLICY "Tarjetas propias"
  ON public.wallet_cards FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---------- payments (escritos solo por el backend) ----------
CREATE POLICY "Pagos visibles para las partes o admin"
  ON public.payments FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT auth.uid()) OR (SELECT public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.reservations r WHERE r.id = payments.reservation_id AND r.owner_id = (SELECT auth.uid())
    )
  );

-- ---------- favorites ----------
CREATE POLICY "Favoritos propios"
  ON public.favorites FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------- reviews ----------
CREATE POLICY "Valoraciones públicas"
  ON public.reviews FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Arrendatario valora reservas finalizadas"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND r.tenant_id = (SELECT auth.uid())
        AND r.space_id = reviews.space_id
        AND (r.status = 'completed' OR (r.status = 'confirmed' AND r.end_date <= public.chile_today()))
    )
  );
CREATE POLICY "Autor o propietario editan la valoración"
  ON public.reviews FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT auth.uid()) OR (SELECT public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.spaces s WHERE s.id = reviews.space_id AND s.owner_id = (SELECT auth.uid()))
  );
CREATE POLICY "Autor o admin eliminan la valoración"
  ON public.reviews FOR DELETE TO authenticated
  USING (tenant_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- ---------- user_reports ----------
CREATE POLICY "Crear reportes propios"
  ON public.user_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (SELECT auth.uid()) AND status = 'open');
CREATE POLICY "Ver reportes propios o admin"
  ON public.user_reports FOR SELECT TO authenticated
  USING (reporter_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY "Gestionar reportes admin"
  ON public.user_reports FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

-- ---------- space_views ----------
CREATE POLICY "Registrar visita al detalle"
  ON public.space_views FOR INSERT TO anon, authenticated
  WITH CHECK (
    (viewer_id IS NULL OR viewer_id = (SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = space_id AND s.status = 'active')
  );
CREATE POLICY "Visitas visibles para admin"
  ON public.space_views FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- ---------- space_blocks (el calendario público usa get_space_occupancy) ----------
CREATE POLICY "Propietario gestiona sus bloqueos"
  ON public.space_blocks FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
  WITH CHECK (owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- ---------- owner_payouts (los escribe el sistema; los paga admin) ----------
CREATE POLICY "Liquidaciones propias o admin"
  ON public.owner_payouts FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY "Admin gestiona liquidaciones"
  ON public.owner_payouts FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

-- ---------- payment_refunds (los escribe solo el backend) ----------
CREATE POLICY "Reembolsos visibles para las partes o admin"
  ON public.payment_refunds FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = payment_refunds.reservation_id
        AND (r.tenant_id = (SELECT auth.uid()) OR r.owner_id = (SELECT auth.uid()))
    )
  );

-- ---------- user_consents ----------
CREATE POLICY "Consentimientos propios o admin"
  ON public.user_consents FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY "Registrar consentimiento propio"
  ON public.user_consents FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------- support_tickets ----------
CREATE POLICY "Tickets propios o admin"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY "Crear ticket propio"
  ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Actualizar ticket propio o admin"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
  WITH CHECK (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- ==============================================================================
-- 9. STORAGE: BUCKETS Y POLÍTICAS (carpeta por usuario)
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

-- Elimina políticas anteriores de Spotly en storage.objects (nombres actuales y antiguos).
DO $$
DECLARE
  pol TEXT;
BEGIN
  FOREACH pol IN ARRAY ARRAY[
    'Lectura pública de fotos de espacios',
    'Usuarios autenticados pueden subir fotos de espacios', 'Dueños suben fotos de sus espacios',
    'Dueños o admins pueden modificar fotos de espacios', 'Dueños modifican fotos de sus espacios',
    'Dueños o admins pueden eliminar fotos de espacios', 'Dueños eliminan fotos de sus espacios',
    'Acceso a documentos KYC propios o admin', 'Subida de documentos KYC propios',
    'Actualización de documentos KYC propios',
    'Acceso a biometría propia o admin', 'Subida de biometría propia', 'Actualización de biometría propia',
    'Acceso a contratos propios o admin', 'Subida de contratos por usuarios autenticados'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol);
  END LOOP;
END $$;

-- ---------- spaces (fotos públicas): {user_id}/... ----------
CREATE POLICY "Lectura pública de fotos de espacios"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'spaces');
CREATE POLICY "Dueños suben fotos de sus espacios"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'spaces' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "Dueños modifican fotos de sus espacios"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'spaces' AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR (SELECT public.is_admin())))
  WITH CHECK (bucket_id = 'spaces' AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR (SELECT public.is_admin())));
CREATE POLICY "Dueños eliminan fotos de sus espacios"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'spaces' AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR (SELECT public.is_admin())));

-- ---------- kyc-documents (privado): {user_id}/... ----------
CREATE POLICY "Acceso a documentos KYC propios o admin"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kyc-documents' AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR (SELECT public.is_admin())));
CREATE POLICY "Subida de documentos KYC propios"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "Actualización de documentos KYC propios"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- ---------- kyc-biometrics (privado): {user_id}/... ----------
CREATE POLICY "Acceso a biometría propia o admin"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kyc-biometrics' AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR (SELECT public.is_admin())));
CREATE POLICY "Subida de biometría propia"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kyc-biometrics' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "Actualización de biometría propia"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'kyc-biometrics' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'kyc-biometrics' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- ---------- contracts (privado): {reservation_id}/... ----------
CREATE POLICY "Acceso a contratos propios o admin"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'contracts'
    AND ((SELECT public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = (storage.foldername(name))[1]
        AND (r.tenant_id = (SELECT auth.uid()) OR r.owner_id = (SELECT auth.uid()))
    ))
  );
CREATE POLICY "Subida de contratos por usuarios autenticados"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contracts'
    AND ((SELECT public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = (storage.foldername(name))[1]
        AND (r.tenant_id = (SELECT auth.uid()) OR r.owner_id = (SELECT auth.uid()))
    ))
  );

-- ==============================================================================
-- 10. PERMISOS (mínimo privilegio, RNF-06)
-- ==============================================================================
-- Punto de partida: los clientes (anon, authenticated) no tienen ningún permiso.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Visitantes sin sesión: catálogo (sin RUT ni dirección exacta), valoraciones y
-- registro de visitas al detalle.
GRANT SELECT (
  id, owner_id, owner_name, owner_verified, title, description, category,
  space_environment, rental_modality, enabled_modalities, price_unit, commune, region,
  price_per_day, price_per_hour, price_per_month, capacity, surface_m2, amenities,
  rules, opening_hours, security_deposit, images, is_verified, status, rating,
  reviews_count, min_booking_days, min_booking_hours, instant_booking, created_at, updated_at
) ON public.spaces TO anon, authenticated;
GRANT SELECT ON public.reviews TO anon;
GRANT INSERT (space_id, viewer_id) ON public.space_views TO anon, authenticated;

-- Usuarios con sesión (RLS limita las filas a las propias).
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (
  full_name, first_names, surnames, email, rut, phone, avatar_url, gender, birth_date,
  role, owner_terms_accepted, owner_application_date, verification_status,
  kyc_rejection_reason, kyc_data, commune, city
) ON public.profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.spaces TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.reservations TO authenticated;
GRANT SELECT, INSERT ON public.contracts TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.disputes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.visit_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT ON public.kyc_verifications TO authenticated;
GRANT SELECT ON public.payments TO authenticated;
GRANT SELECT (id, user_id, status, card_type, card_last4, is_default, created_at)
  ON public.wallet_cards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_codes TO authenticated;
GRANT SELECT ON public.space_views TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.space_blocks TO authenticated;
GRANT SELECT ON public.owner_payouts TO authenticated;
GRANT UPDATE (status, transfer_reference, paid_at) ON public.owner_payouts TO authenticated;  -- RLS: solo admin
GRANT SELECT ON public.payment_refunds TO authenticated;
GRANT SELECT ON public.user_consents TO authenticated;
GRANT INSERT (user_id, document, version, accepted) ON public.user_consents TO authenticated;
GRANT SELECT ON public.support_tickets TO authenticated;
GRANT INSERT (user_id, reservation_id, subject, message) ON public.support_tickets TO authenticated;
GRANT UPDATE (status, admin_reply) ON public.support_tickets TO authenticated;
-- login_attempts: sin permisos para clientes.

-- Backend (service_role): acceso completo; lo usan solo las funciones de /api.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Funciones: ninguna es ejecutable por clientes salvo las listadas.
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.signature);
  END LOOP;
END $$;

-- Usadas por las políticas, valores por defecto e índices (deben ser ejecutables por el rol del usuario).
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chile_today() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_id(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_rut(TEXT) TO anon, authenticated;
-- RPC públicas de la aplicación.
GRANT EXECUTE ON FUNCTION public.get_space_occupancy(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_discount(TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_spaces_private_details() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_kpis(INTEGER) TO authenticated;                     -- valida is_admin()
GRANT EXECUTE ON FUNCTION public.admin_set_user_suspension(UUID, BOOLEAN, TEXT) TO authenticated; -- valida is_admin()
GRANT EXECUTE ON FUNCTION public.admin_anonymize_user(UUID) TO authenticated;              -- valida is_admin()
GRANT EXECUTE ON FUNCTION public.period_range(DATE, DATE, INTEGER, INTEGER) TO anon, authenticated;

-- ==============================================================================
-- 11. TIEMPO REAL (campana de notificaciones)
-- ==============================================================================
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
-- 11b. MANTENIMIENTO AUTOMÁTICO (pg_cron, si está disponible)
-- ==============================================================================
-- Cada 5 minutos libera retenciones de pago vencidas y purga datos caducados.
-- Si pg_cron no está habilitado (Database → Extensions), se omite sin abortar.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('spotly-maintenance', '*/5 * * * *', 'SELECT public.run_maintenance()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron no disponible (%): ejecuta SELECT public.run_maintenance() desde un job externo', SQLERRM;
END $$;

-- ==============================================================================
-- 12. DATOS INICIALES
-- ==============================================================================
-- Recupera los perfiles de las cuentas Auth que ya existían. Si dos cuentas
-- comparten RUT, el RUT queda solo en la más antigua (el índice único impide
-- duplicados desde ahora).
INSERT INTO public.profiles (
  id, full_name, first_names, surnames, email, rut, phone, gender, birth_date,
  role, owner_terms_accepted, verification_status
)
SELECT
  u.id,
  left(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', 'Usuario Spotly'), 200),
  left(COALESCE(u.raw_user_meta_data->>'first_names', ''), 120),
  left(COALESCE(u.raw_user_meta_data->>'surnames', ''), 120),
  COALESCE(u.email, u.id::text || '@sin-correo.spotly.cl'),
  CASE WHEN u.rut_rank = 1 THEN left(COALESCE(u.raw_user_meta_data->>'rut', ''), 15) ELSE '' END,
  left(COALESCE(u.raw_user_meta_data->>'phone', ''), 30),
  CASE WHEN u.raw_user_meta_data->>'gender' IN ('masculino', 'femenino', 'no_binario', 'otro', 'prefiero_no_decir')
       THEN u.raw_user_meta_data->>'gender' ELSE 'prefiero_no_decir' END,
  CASE WHEN COALESCE(u.raw_user_meta_data->>'birth_date', '') ~ '^\d{4}-\d{2}-\d{2}$'
       THEN (u.raw_user_meta_data->>'birth_date')::date END,
  CASE WHEN u.raw_user_meta_data->>'role' = 'owner' THEN 'owner' ELSE 'tenant' END,
  COALESCE((u.raw_user_meta_data->>'owner_terms_accepted')::boolean, false),
  'unverified'
FROM (
  SELECT au.*,
         row_number() OVER (
           PARTITION BY COALESCE(public.normalize_rut(au.raw_user_meta_data->>'rut'), au.id::text)
           ORDER BY au.created_at, au.id
         ) AS rut_rank
  FROM auth.users au
) u
ON CONFLICT (id) DO NOTHING;

-- Código de bienvenida del piloto.
INSERT INTO public.discount_codes (code, description, percent_off, max_discount_clp, max_uses)
VALUES ('SPOTLY10', 'Descuento de bienvenida del piloto (10% sobre el arriendo)', 10, 50000, 500);

-- Estadísticas iniciales para el planificador de consultas.
ANALYZE public.profiles;
ANALYZE public.spaces;
ANALYZE public.reservations;

COMMIT;

-- Recarga la caché de esquema de la API (PostgREST) para que vea las tablas nuevas al instante.
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- Verificación rápida (opcional, después de ejecutar):
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
--   -- todas deben mostrar rowsecurity = true
-- ==============================================================================
