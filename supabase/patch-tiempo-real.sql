-- ==============================================================================
-- SPOTLY · PARCHE: actualización en tiempo real sin recargar la página
-- ==============================================================================
-- NO es destructivo: no borra tablas ni datos. Úsalo en una base que ya tiene el
-- esquema de reset-and-setup.sql (ese script ya incluye este cambio).
--
-- Cómo ejecutarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- ==============================================================================

BEGIN;

-- b) Avisos de cambio con carga mínima (Realtime Broadcast desde la base).
--    En vez de publicar filas completas (que podrían saltarse los permisos por
--    columna, p. ej. owner_rut y address), cada cambio envía solo
--    { table, op } a los temas que corresponden; el navegador vuelve a consultar
--    esa tabla con sus consultas normales (RLS + permisos por columna).
--    Temas:  catalog        → cambios del catálogo de espacios (todos)
--            space:<id>     → reservas de un espacio (calendario público)
--            user:<uuid>    → lo que afecta a ese usuario (arrendatario o propietario)
--            admin          → todo, solo para administradores
CREATE OR REPLACE FUNCTION public.broadcast_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row JSONB;
  v_tenant TEXT;
  v_owner TEXT;
  v_space TEXT;
  v_topics TEXT[];
  v_topic TEXT;
BEGIN
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RETURN NULL;
  END IF;

  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_tenant := v_row->>'tenant_id';
  v_owner := v_row->>'owner_id';
  v_space := v_row->>'space_id';

  -- contracts y payments no guardan ambos participantes: se toman de la reserva.
  IF TG_TABLE_NAME IN ('contracts', 'payments') AND v_row ? 'reservation_id' THEN
    SELECT COALESCE(v_tenant, r.tenant_id::text), COALESCE(v_owner, r.owner_id::text), COALESCE(v_space, r.space_id)
      INTO v_tenant, v_owner, v_space
    FROM public.reservations r
    WHERE r.id = v_row->>'reservation_id';
  END IF;

  v_topics := CASE TG_TABLE_NAME
    WHEN 'spaces' THEN ARRAY['catalog']
    WHEN 'profiles' THEN ARRAY['user:' || (v_row->>'id'), 'admin']
    WHEN 'reservations' THEN ARRAY['user:' || v_tenant, 'user:' || v_owner, 'space:' || v_space, 'admin']
    ELSE ARRAY['user:' || v_tenant, 'user:' || v_owner, 'admin']
  END;

  FOREACH v_topic IN ARRAY COALESCE((SELECT array_agg(DISTINCT t) FROM unnest(v_topics) t WHERE t IS NOT NULL), '{}') LOOP
    PERFORM realtime.send(jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP), 'change', v_topic, true);
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Un aviso fallido nunca debe impedir guardar el dato.
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['spaces', 'reservations', 'contracts', 'payments', 'disputes', 'visit_requests', 'profiles'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_broadcast_change ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER zz_broadcast_change AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.broadcast_change()', t);
  END LOOP;
END $$;

-- Quién puede escuchar cada tema (canales privados de Realtime).
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS spotly_realtime_read ON realtime.messages;
    CREATE POLICY spotly_realtime_read ON realtime.messages
      FOR SELECT TO anon, authenticated
      USING (
        realtime.messages.extension = 'broadcast'
        AND (
          (SELECT realtime.topic()) = 'catalog'
          OR (SELECT realtime.topic()) LIKE 'space:%'
          OR (SELECT realtime.topic()) = 'user:' || (SELECT auth.uid())::text
          OR ((SELECT realtime.topic()) = 'admin' AND (SELECT public.is_admin()))
        )
      );
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.broadcast_change() FROM PUBLIC, anon, authenticated;

COMMIT;
