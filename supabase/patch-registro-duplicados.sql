-- ==============================================================================
-- SPOTLY · PARCHE: impedir registros con correo o RUT ya existentes
-- ==============================================================================
-- NO es destructivo: no borra tablas ni datos. Úsalo en una base que ya tiene el
-- esquema de reset-and-setup.sql (ese script ya incluye este cambio).
--
-- Cómo ejecutarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
--
-- Qué hace:
--   1. Crea la RPC check_signup_availability(correo, rut) que usa el formulario
--      de registro para avisar antes de crear la cuenta.
--   2. Se asegura de que exista el índice único de RUT en profiles. Si ya hay
--      RUT repetidos, NO lo crea y muestra cuáles son (ver consulta al final).
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_rut(r TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(upper(regexp_replace(COALESCE(r, ''), '[^0-9kK]', '', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.check_signup_availability(p_email TEXT, p_rut TEXT)
RETURNS TABLE (email_taken BOOLEAN, rut_taken BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    NULLIF(lower(trim(COALESCE(p_email, ''))), '') IS NOT NULL AND (
      EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = left(lower(trim(p_email)), 320))
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.email) = left(lower(trim(p_email)), 320))
    ),
    public.normalize_rut(left(p_rut, 20)) IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE public.normalize_rut(p.rut) = public.normalize_rut(left(p_rut, 20))
    );
$$;

REVOKE ALL ON FUNCTION public.check_signup_availability(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_signup_availability(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_rut(TEXT) TO anon, authenticated;

-- Índice único de RUT (la garantía real en la base de datos).
DO $$
DECLARE
  v_dupes INTEGER;
BEGIN
  IF to_regclass('public.profiles_rut_unique') IS NOT NULL THEN
    RAISE NOTICE 'OK: el índice profiles_rut_unique ya existe.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_dupes FROM (
    SELECT public.normalize_rut(rut)
    FROM public.profiles
    WHERE public.normalize_rut(rut) IS NOT NULL
    GROUP BY 1 HAVING count(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE WARNING 'Hay % RUT repetidos en profiles: el índice único NO se creó. Revisa la consulta del final, corrige los duplicados y vuelve a ejecutar este parche.', v_dupes;
  ELSE
    CREATE UNIQUE INDEX profiles_rut_unique ON public.profiles (public.normalize_rut(rut))
      WHERE public.normalize_rut(rut) IS NOT NULL;
    RAISE NOTICE 'OK: índice profiles_rut_unique creado.';
  END IF;
END $$;

COMMIT;

-- ------------------------------------------------------------------------------
-- (Opcional) Ver cuentas que comparten RUT o correo, para limpiarlas a mano:
-- ------------------------------------------------------------------------------
-- SELECT public.normalize_rut(rut) AS rut, array_agg(email ORDER BY created_at) AS cuentas
-- FROM public.profiles
-- WHERE public.normalize_rut(rut) IS NOT NULL
-- GROUP BY 1 HAVING count(*) > 1;
--
-- SELECT lower(email) AS correo, count(*) FROM public.profiles GROUP BY 1 HAVING count(*) > 1;
