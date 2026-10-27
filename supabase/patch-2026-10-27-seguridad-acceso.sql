-- ==============================================================================
-- SPOTLY · PARCHE 2026-10-27: verificación de correo y seguridad de acceso
-- ==============================================================================
-- NO es destructivo: no borra datos. Úsalo si ya ejecutaste reset-and-setup.sql
-- antes de esta fecha. (Si vas a ejecutar reset-and-setup.sql completo, ya lo incluye.)
-- Supabase → SQL Editor → New query → pegar todo → Run.
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
