-- ==============================================================================
-- SPOTLY · PARCHE: "permission denied for function ..." al firmar el contrato
-- ==============================================================================
-- Los triggers contracts_before_insert, contracts_immutable, consents_before_insert
-- y audit_logs_before_insert se ejecutan con el rol del usuario (authenticated) y
-- llaman a funciones auxiliares que habían quedado sin permiso de ejecución.
-- Estas tres solo leen la propia petición/sesión (IP, navegador y si la llamada
-- viene del servidor): concederlas no da acceso a ningún dato.
--
-- Se revisaron TODAS las funciones del esquema: estas son las únicas que faltaban.
-- NO es destructivo. Supabase → SQL Editor → New query → pegar → Run.
-- ==============================================================================
GRANT EXECUTE ON FUNCTION public.request_ip() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_user_agent() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_trusted_context() TO anon, authenticated;
