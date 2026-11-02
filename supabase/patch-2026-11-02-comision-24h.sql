-- ==============================================================================
-- SPOTLY · PARCHE 2026-11-02 (b): comisión según 24 horas
-- ==============================================================================
-- NO es destructivo. Supabase → SQL Editor → New query → pegar todo → Run.
--
-- Nueva regla cuando cancela el arrendatario:
--   ≥ 48 h antes del inicio: 100 % del arriendo + garantía + comisión
--   24–48 h antes:            50 % del arriendo + garantía + comisión
--   < 24 h antes:              solo la garantía (la comisión se cobra)
-- Si cancela el propietario o administración, o se rechaza la solicitud: 100 %.
BEGIN;

CREATE OR REPLACE FUNCTION public.compute_refund(
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
  -- Con 24 h o más de anticipación también se devuelve la comisión.
  IF v_hours >= 48 THEN
    RETURN v_rent + p_res.security_deposit_clp + COALESCE(p_res.platform_fee_clp, 0);
  ELSIF v_hours >= 24 THEN
    RETURN round(v_rent * 0.5) + p_res.security_deposit_clp + COALESCE(p_res.platform_fee_clp, 0);
  ELSE
    RETURN p_res.security_deposit_clp;
  END IF;
END;
$$;

COMMIT;
