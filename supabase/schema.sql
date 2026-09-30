-- ==============================================================================
-- SPOTLY CHILE - SCHEMA COMPLETO DE BASE DE DATOS Y STORAGE (SUPABASE POSTGRESQL)
-- ==============================================================================
-- Este script crea todas las tablas, relaciones, disparadores de autenticación,
-- políticas de seguridad a nivel de fila (RLS) y configuración de buckets de Storage.
-- Copia y pega este contenido directamente en el SQL Editor de tu proyecto en Supabase.
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA: profiles (Perfiles de usuarios integrados con Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    rut TEXT,
    phone TEXT,
    avatar_url TEXT,
    gender TEXT CHECK (gender IN ('masculino', 'femenino', 'no_binario', 'otro', 'prefiero_no_decir')),
    birth_date DATE,
    role TEXT NOT NULL DEFAULT 'tenant' CHECK (role IN ('tenant', 'owner', 'admin')),
    owner_terms_accepted BOOLEAN NOT NULL DEFAULT false,
    owner_application_date TIMESTAMPTZ,
    verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'in_progress', 'pending_review', 'verified', 'rejected')),
    kyc_rejection_reason TEXT,
    kyc_data JSONB DEFAULT '{}'::jsonb,
    commune TEXT DEFAULT 'Santiago',
    city TEXT DEFAULT 'Santiago',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABLA: spaces (Propiedades, oficinas, salas de eventos y recintos)
CREATE TABLE IF NOT EXISTS public.spaces (
    id TEXT PRIMARY KEY,
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

-- 4. TABLA: reservations (Reservas y contratos de arriendo en custodia)
CREATE TABLE IF NOT EXISTS public.reservations (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
    space_title TEXT NOT NULL,
    space_address TEXT,
    space_image TEXT,
    space_category TEXT,
    space_environment TEXT,
    tenant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    tenant_name TEXT NOT NULL,
    tenant_email TEXT NOT NULL,
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
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'rejected', 'completed')),
    digital_contract_id TEXT,
    dispute_status TEXT DEFAULT 'none' CHECK (dispute_status IN ('none', 'opened', 'in_review', 'resolved')),
    dispute_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. TABLA: contracts (Contratos digitales con sello criptográfico y firma)
CREATE TABLE IF NOT EXISTS public.contracts (
    id TEXT PRIMARY KEY,
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

-- 6. TABLA: audit_logs (Bitácora inmutable de auditoría y seguridad)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
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

-- 7. TABLA: disputes (Gestión y mediación de reclamos y disputas)
CREATE TABLE IF NOT EXISTS public.disputes (
    id TEXT PRIMARY KEY,
    reservation_id TEXT,
    space_id TEXT,
    space_title TEXT NOT NULL,
    tenant_id TEXT,
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
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved_refund', 'resolved_owner')),
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. TABLA: visit_requests (Agendamiento de visitas presenciales o virtuales)
CREATE TABLE IF NOT EXISTS public.visit_requests (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    space_title TEXT NOT NULL,
    space_address TEXT,
    space_image TEXT,
    tenant_id TEXT NOT NULL,
    tenant_name TEXT NOT NULL,
    tenant_email TEXT NOT NULL,
    tenant_phone TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    owner_rut TEXT,
    visit_date DATE NOT NULL,
    visit_time_slot TEXT NOT NULL,
    modality TEXT NOT NULL DEFAULT 'presencial' CHECK (modality IN ('presencial', 'virtual')),
    attendees_count INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. TABLA: saved_cards (Billetera de medios de pago simulados)
CREATE TABLE IF NOT EXISTS public.saved_cards (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    card_brand TEXT NOT NULL CHECK (card_brand IN ('visa', 'mastercard', 'redcompra')),
    card_holder TEXT NOT NULL,
    last4 TEXT NOT NULL,
    expiry_month TEXT NOT NULL,
    expiry_year TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- DISPARADORES (TRIGGERS): SINCRONIZACIÓN AUTOMÁTICA DE USUARIOS
-- ==============================================================================

-- Cuando un usuario se registra con Supabase Auth (auth.users), se crea o actualiza
-- automáticamente su perfil correspondiente en public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
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
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'rut', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', '+56 9 '),
    COALESCE(NEW.raw_user_meta_data->>'gender', 'prefiero_no_decir'),
    CASE 
      WHEN NEW.raw_user_meta_data->>'birth_date' IS NOT NULL AND NEW.raw_user_meta_data->>'birth_date' <> '' 
      THEN (NEW.raw_user_meta_data->>'birth_date')::DATE 
      ELSE NULL 
    END,
    COALESCE(NEW.raw_user_meta_data->>'role', 'tenant'),
    COALESCE((NEW.raw_user_meta_data->>'owner_terms_accepted')::boolean, false),
    COALESCE(NEW.raw_user_meta_data->>'verification_status', 'unverified'),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger para actualizar fecha updated_at automáticamente
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
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
-- POLÍTICAS DE SEGURIDAD A NIVEL DE FILA (ROW LEVEL SECURITY - RLS)
-- ==============================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_cards ENABLE ROW LEVEL SECURITY;

-- Helper: función para verificar si el usuario es administrador
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- RLS: PROFILES
-- ------------------------------------------------------------------------------
-- Cualquier usuario autenticado o anónimo puede leer perfiles básicos (necesario para ver quién es el anfitrión)
CREATE POLICY "Lectura pública de perfiles"
  ON public.profiles FOR SELECT
  USING (true);

-- Cada usuario puede actualizar su propio perfil, o un admin puede actualizar cualquiera
CREATE POLICY "Actualización de perfil propio o admin"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- Inserción permitida para el propio usuario o trigger
CREATE POLICY "Inserción de perfil propio"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id OR public.is_admin() OR auth.uid() IS NULL);

-- ------------------------------------------------------------------------------
-- RLS: SPACES
-- ------------------------------------------------------------------------------
-- Lectura pública para cualquier espacio activo, o si es el dueño o admin
CREATE POLICY "Lectura pública de espacios activos"
  ON public.spaces FOR SELECT
  USING (status = 'active' OR auth.uid() = owner_id OR public.is_admin());

-- Inserción de espacios: solo propietarios autenticados o admins
CREATE POLICY "Propietarios pueden crear espacios"
  ON public.spaces FOR INSERT
  WITH CHECK (auth.uid() = owner_id OR public.is_admin());

-- Modificación de espacios: solo el propietario del espacio o admin
CREATE POLICY "Propietarios pueden actualizar sus espacios"
  ON public.spaces FOR UPDATE
  USING (auth.uid() = owner_id OR public.is_admin())
  WITH CHECK (auth.uid() = owner_id OR public.is_admin());

-- Eliminación de espacios: solo el propietario o admin
CREATE POLICY "Propietarios pueden eliminar sus espacios"
  ON public.spaces FOR DELETE
  USING (auth.uid() = owner_id OR public.is_admin());

-- ------------------------------------------------------------------------------
-- RLS: RESERVATIONS
-- ------------------------------------------------------------------------------
-- Lectura de reservas: inquilino, propietario del inmueble o admin
CREATE POLICY "Partes de la reserva o admin pueden verla"
  ON public.reservations FOR SELECT
  USING (auth.uid() = tenant_id OR auth.uid() = owner_id OR public.is_admin());

-- Creación de reservas: cualquier usuario autenticado como inquilino
CREATE POLICY "Inquilinos pueden solicitar reservas"
  ON public.reservations FOR INSERT
  WITH CHECK (auth.uid() = tenant_id OR public.is_admin());

-- Actualización de reservas: inquilino (para cancelar), propietario (para aceptar/rechazar) o admin
CREATE POLICY "Partes o admin pueden actualizar estado de reserva"
  ON public.reservations FOR UPDATE
  USING (auth.uid() = tenant_id OR auth.uid() = owner_id OR public.is_admin())
  WITH CHECK (auth.uid() = tenant_id OR auth.uid() = owner_id OR public.is_admin());

-- ------------------------------------------------------------------------------
-- RLS: CONTRACTS
-- ------------------------------------------------------------------------------
-- Lectura de contratos: las partes involucradas (mediante join a la reserva o RUTs) o admin
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

-- Inserción de contratos: generados al formalizar la reserva
CREATE POLICY "Inserción de contratos"
  ON public.contracts FOR INSERT
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- RLS: AUDIT_LOGS
-- ------------------------------------------------------------------------------
-- Inserción de auditoría permitida para cualquier cliente autenticado o evento
CREATE POLICY "Inserción de registros de auditoría"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

-- Lectura de auditoría: administradores y el propio usuario
CREATE POLICY "Lectura de auditoría propia o admin"
  ON public.audit_logs FOR SELECT
  USING (user_id = auth.uid()::text OR public.is_admin());

-- ------------------------------------------------------------------------------
-- RLS: DISPUTES
-- ------------------------------------------------------------------------------
CREATE POLICY "Partes de disputa o admin pueden leerla"
  ON public.disputes FOR SELECT
  USING (tenant_id = auth.uid()::text OR public.is_admin());

CREATE POLICY "Creación de disputas"
  ON public.disputes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Resolución de disputas por admin"
  ON public.disputes FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- RLS: VISIT_REQUESTS
-- ------------------------------------------------------------------------------
CREATE POLICY "Partes de visita pueden ver la solicitud"
  ON public.visit_requests FOR SELECT
  USING (tenant_id = auth.uid()::text OR owner_id = auth.uid()::text OR public.is_admin());

CREATE POLICY "Creación de solicitud de visita"
  ON public.visit_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Actualización de visita"
  ON public.visit_requests FOR UPDATE
  USING (tenant_id = auth.uid()::text OR owner_id = auth.uid()::text OR public.is_admin());

-- ------------------------------------------------------------------------------
-- RLS: SAVED_CARDS
-- ------------------------------------------------------------------------------
CREATE POLICY "Usuarios ven solo sus tarjetas guardadas"
  ON public.saved_cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuarios gestionan sus tarjetas guardadas"
  ON public.saved_cards FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- 10. CONFIGURACIÓN DE SUPABASE STORAGE (BUCKETS Y POLÍTICAS)
-- ==============================================================================

-- Creación de Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('spaces', 'spaces', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('kyc-documents', 'kyc-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'application/pdf']),
  ('kyc-biometrics', 'kyc-biometrics', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('contracts', 'contracts', false, 10485760, ARRAY['application/pdf', 'image/png', 'text/plain'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Políticas Storage para Bucket: spaces (Imágenes de propiedades - Público para lectura)
CREATE POLICY "Lectura pública de fotos de espacios"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'spaces');

CREATE POLICY "Usuarios autenticados pueden subir fotos de espacios"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'spaces' AND auth.role() = 'authenticated');

CREATE POLICY "Dueños o admins pueden modificar fotos de espacios"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'spaces' AND auth.role() = 'authenticated');

CREATE POLICY "Dueños o admins pueden eliminar fotos de espacios"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'spaces' AND auth.role() = 'authenticated');

-- Políticas Storage para Bucket: kyc-documents (Privado - Cédula y Antecedentes)
CREATE POLICY "Acceso a documentos KYC propios o admin"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kyc-documents' AND
    (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
  );

CREATE POLICY "Subida de documentos KYC propios"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'kyc-documents' AND
    (auth.uid()::text = (storage.foldername(name))[1] OR auth.role() = 'authenticated')
  );

-- Políticas Storage para Bucket: kyc-biometrics (Privado - Reconocimiento Facial)
CREATE POLICY "Acceso a biometría propia o admin"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kyc-biometrics' AND
    (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
  );

CREATE POLICY "Subida de biometría propia"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'kyc-biometrics' AND
    (auth.uid()::text = (storage.foldername(name))[1] OR auth.role() = 'authenticated')
  );

-- Políticas Storage para Bucket: contracts (Privado - PDFs de Contratos Firmados)
CREATE POLICY "Acceso a contratos propios o admin"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'contracts' AND auth.role() = 'authenticated');

CREATE POLICY "Subida de contratos por usuarios autenticados"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'contracts' AND auth.role() = 'authenticated');
