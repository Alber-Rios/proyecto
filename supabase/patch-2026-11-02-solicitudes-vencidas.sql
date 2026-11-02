-- ==============================================================================
-- SPOTLY · PARCHE 2026-11-02: solicitudes que vencen sin respuesta
-- ==============================================================================
-- NO es destructivo. Úsalo si ya ejecutaste reset-and-setup.sql antes de esta
-- fecha. Supabase → SQL Editor → New query → pegar todo → Run.
--
-- Problema: una solicitud por aprobar seguía apareciendo después de su hora.
-- La base la vence sola con pg_cron cada 5 minutos, pero si pg_cron no está
-- activo nunca se ejecutaba. Este parche:
--   1. agrega expire_my_unanswered_requests(), que la app llama al cargar;
--   2. impide aprobar una solicitud cuya hora de inicio ya pasó;
--   3. vuelve a programar el mantenimiento cada 5 minutos si pg_cron existe;
--   4. vence ahora mismo las solicitudes atrasadas.
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
