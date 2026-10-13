-- SPOTLY: actualización NO destructiva para una base ya creada con reset-and-setup.sql.
-- Ejecutar completo en Supabase SQL Editor. No borra datos.
--   1. Categorías de espacio en español (y conversión de las existentes).
--   2. Garantía solo en arriendos mensuales y opcional para el propietario.
--   3. Billetera de tarjetas con Transbank Oneclick Mall.
BEGIN;

-- 1. Categorías
ALTER TABLE public.spaces DROP CONSTRAINT IF EXISTS spaces_category_check;
UPDATE public.spaces SET category = CASE category
  WHEN 'office' THEN 'oficina'
  WHEN 'event' THEN 'salon_eventos'
  WHEN 'studio' THEN 'estudio'
  WHEN 'warehouse' THEN 'bodega'
  WHEN 'retail' THEN 'local_comercial'
  ELSE category END
WHERE category IN ('office', 'event', 'studio', 'warehouse', 'retail');
UPDATE public.reservations SET space_category = CASE space_category
  WHEN 'office' THEN 'oficina'
  WHEN 'event' THEN 'salon_eventos'
  WHEN 'studio' THEN 'estudio'
  WHEN 'warehouse' THEN 'bodega'
  WHEN 'retail' THEN 'local_comercial'
  ELSE space_category END
WHERE space_category IN ('office', 'event', 'studio', 'warehouse', 'retail');
ALTER TABLE public.spaces ADD CONSTRAINT spaces_category_check CHECK (category IN (
  'departamento', 'casa', 'cabana', 'oficina', 'cowork', 'sala_reuniones', 'consulta', 'estudio', 'salon_eventos', 'quincho', 'terreno', 'local_comercial', 'bodega', 'estacionamiento', 'otro'));

-- 2. Garantía
-- Montos esperados según la tarifa publicada (misma regla que src/utils/pricing.ts).
-- La garantía solo se cobra en arriendos mensuales y solo si el propietario la exige.
CREATE OR REPLACE FUNCTION public.expected_reservation_amounts(
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
    v_price := COALESCE(NULLIF(p_space.price_per_hour, 0), 45000);
  ELSIF p_price_unit = 'month' THEN
    v_units := GREATEST(ceil(v_days / 30.0)::int, 1);
    v_price := COALESCE(NULLIF(p_space.price_per_month, 0), 3800000);
  ELSE
    v_units := GREATEST(v_days, 1);
    v_price := p_space.price_per_day;
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

-- 3. Billetera
-- ==============================================================================
-- 18. BILLETERA: TARJETAS INSCRITAS CON TRANSBANK ONECLICK MALL
-- ==============================================================================
-- Spotly no guarda números de tarjeta. Transbank entrega un identificador
-- (tbk_user) que solo lee el backend (service role) para cobrar; el cliente ve
-- únicamente el tipo de tarjeta y los últimos 4 dígitos.
CREATE TABLE IF NOT EXISTS public.wallet_cards (
  id TEXT PRIMARY KEY DEFAULT public.generate_id('crd'),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'failed')),
  environment TEXT NOT NULL DEFAULT 'integration' CHECK (environment IN ('integration', 'production')),
  inscription_token TEXT UNIQUE,
  tbk_user TEXT,
  card_type TEXT,
  card_last4 TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  return_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_cards_user ON public.wallet_cards(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_cards_one_default
  ON public.wallet_cards(user_id) WHERE is_default AND status = 'active';
ALTER TABLE public.wallet_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tarjetas propias" ON public.wallet_cards;
CREATE POLICY "Tarjetas propias"
  ON public.wallet_cards FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP TRIGGER IF EXISTS set_wallet_cards_updated_at ON public.wallet_cards;
CREATE TRIGGER set_wallet_cards_updated_at
  BEFORE UPDATE ON public.wallet_cards
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- Solo lectura de columnas no sensibles; las escrituras las hace /api/wallet.
REVOKE ALL ON public.wallet_cards FROM anon, authenticated;
GRANT SELECT (id, user_id, status, card_type, card_last4, is_default, created_at)
  ON public.wallet_cards TO authenticated;
GRANT ALL ON public.wallet_cards TO service_role;

-- Pagos con tarjeta guardada (Oneclick Mall): datos para reembolsar.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS wallet_card_id TEXT
  REFERENCES public.wallet_cards(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS child_commerce_code TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS child_buy_order TEXT;

CREATE OR REPLACE FUNCTION public.payment_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

COMMIT;
