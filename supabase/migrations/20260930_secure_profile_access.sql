ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS tenant_phone TEXT;

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

DROP POLICY IF EXISTS "Lectura pública de perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Lectura de perfil propio o administrador" ON public.profiles;
CREATE POLICY "Lectura de perfil propio o administrador"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Inserción de perfil propio" ON public.profiles;
CREATE POLICY "Inserción de perfil propio"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id OR public.is_admin());
