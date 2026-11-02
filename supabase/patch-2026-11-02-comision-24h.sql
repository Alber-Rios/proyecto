-- ==============================================================================
-- SPOTLY · PARCHE 2026-11-02 (b): cancelación según 24 horas
-- ==============================================================================
-- NO es destructivo. Supabase → SQL Editor → New query → pegar todo → Run.
--
-- Regla cuando cancela el arrendatario:
--   ≥ 24 h antes del inicio: se devuelve todo (arriendo + garantía + comisión)
--   < 24 h antes:              arriendo + garantía (solo se cobra la comisión)
-- Si cancela el propietario o administración, o se rechaza la solicitud: 100 %.
-- El arrendatario ya no puede cancelar una vez que empezó el arriendo.
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
  -- Con 24 h o más se devuelve todo; con menos de 24 h solo se cobra la comisión.
  IF v_hours >= 24 THEN
    RETURN v_rent + p_res.security_deposit_clp + COALESCE(p_res.platform_fee_clp, 0);
  ELSE
    RETURN v_rent + p_res.security_deposit_clp;
  END IF;
END;
$$;

-- Bloquea la cancelación del arrendatario después del inicio del arriendo.
CREATE OR REPLACE FUNCTION public.guard_reservation_update()
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
      -- El arrendatario solo puede cancelar antes de que empiece el arriendo;
      -- después, un problema se reporta como reclamo (lo revisa administración).
      IF v_tenant AND NOT v_owner AND NOT v_admin
         AND (OLD.start_date + make_interval(hours => COALESCE(OLD.hour_start, 0)))
             <= (now() AT TIME ZONE 'America/Santiago') THEN
        RAISE EXCEPTION 'El arriendo ya comenzó y no se puede cancelar. Si hubo un problema, repórtalo desde la reserva.';
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

COMMIT;
