import React, { useEffect, useState } from 'react';
import { CreditCard, Info, Loader2, Lock, Plus, ShieldCheck, Tag, Wallet, X } from 'lucide-react';
import { formatClp } from '../utils/formatters.ts';
import { validateDiscountCode } from '../lib/dataAccess.ts';
import { useApp } from '../context/AppContext.tsx';

export interface AppliedDiscount {
  code: string;
  discountClp: number;
  percentOff?: number;
  maxDiscountClp?: number | null;
}

export type PaymentChoice = { kind: 'card'; cardId: string } | { kind: 'webpay' };

interface CheckoutPaymentBoxProps {
  units: number;
  unitLabel: string;
  basePrice: number;
  subtotalClp: number;
  platformFeeClp: number;
  depositClp: number;
  discount: AppliedDiscount | null;
  onDiscountChange: (discount: AppliedDiscount | null) => void;
  onPay: (choice: PaymentChoice) => Promise<void>;
  onAddCard: () => Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
  notice?: { ok: boolean; text: string } | null;
}

// Pago de la reserva (RF-17): con una tarjeta de la billetera (Transbank Oneclick)
// o en el formulario de Webpay Plus. Spotly nunca recibe datos de tarjetas.
export const CheckoutPaymentBox: React.FC<CheckoutPaymentBoxProps> = ({
  units,
  unitLabel,
  basePrice,
  subtotalClp,
  platformFeeClp,
  depositClp,
  discount,
  onDiscountChange,
  onPay,
  onAddCard,
  onCancel,
  disabled,
  notice,
}) => {
  const { walletCards } = useApp();
  const defaultCard = walletCards.find((c) => c.isDefault) || walletCards[0];
  const [choice, setChoice] = useState<string>(defaultCard ? defaultCard.id : 'webpay');
  const [codeInput, setCodeInput] = useState('');
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Si se cargan las tarjetas después de abrir el pago, se preselecciona la predeterminada.
  useEffect(() => {
    if (choice === 'webpay' && defaultCard) setChoice(defaultCard.id);
    if (choice !== 'webpay' && !walletCards.some((c) => c.id === choice)) setChoice(defaultCard ? defaultCard.id : 'webpay');
  }, [walletCards.length, defaultCard?.id]);

  const discountClp = discount?.discountClp || 0;
  const total = subtotalClp + platformFeeClp + depositClp - discountClp;
  const usingCard = choice !== 'webpay';
  const selectedCard = walletCards.find((c) => c.id === choice);

  const handleApplyCode = async () => {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    setValidating(true);
    setCodeMessage(null);
    try {
      const result = await validateDiscountCode(code, subtotalClp);
      if (result.valid && result.code) {
        onDiscountChange({
          code: result.code,
          discountClp: result.discountClp,
          percentOff: result.percentOff,
          maxDiscountClp: result.maxDiscountClp,
        });
        setCodeMessage(result.message);
      } else {
        onDiscountChange(null);
        setCodeMessage(result.message || 'Código no válido.');
      }
    } finally {
      setValidating(false);
    }
  };

  const handlePay = async () => {
    setPaying(true);
    setPayError(null);
    try {
      await onPay(usingCard ? { kind: 'card', cardId: choice } : { kind: 'webpay' });
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'No se pudo completar el pago.');
    } finally {
      setPaying(false);
    }
  };

  const handleAddCard = async () => {
    setAddingCard(true);
    setPayError(null);
    try {
      await onAddCard();
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'No se pudo iniciar la inscripción de la tarjeta.');
      setAddingCard(false);
    }
  };

  return (
    <div className="space-y-4">
      {notice && (
        <div
          role="status"
          className={`p-3 rounded-xl border text-xs font-semibold ${
            notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Detalle del cobro */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-600">
            {formatClp(basePrice)} × {units} {unitLabel}
          </span>
          <span className="font-bold text-slate-900">{formatClp(subtotalClp)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Comisión de servicio Spotly (5 %)</span>
          <span className="font-bold text-slate-900">{formatClp(platformFeeClp)}</span>
        </div>
        {depositClp > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-600">Garantía mensual (reembolsable)</span>
            <span className="font-bold text-slate-900">{formatClp(depositClp)}</span>
          </div>
        )}
        {discount && (
          <div className="flex justify-between text-emerald-700">
            <span className="flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" /> Descuento {discount.code}
            </span>
            <span className="font-bold">−{formatClp(discountClp)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-200 pt-2 text-sm">
          <span className="font-bold text-slate-900">Total a pagar</span>
          <span className="font-bold text-rose-600">{formatClp(total)}</span>
        </div>
      </div>

      {/* Código de descuento */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
        <label htmlFor="discount-code" className="text-xs font-extrabold text-slate-900 block">
          ¿Tienes un código de descuento?
        </label>
        <div className="flex gap-2">
          <input
            id="discount-code"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="Ej: SPOTLY10"
            disabled={Boolean(discount) || validating}
            className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold uppercase text-slate-900 bg-white focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
          />
          {discount ? (
            <button
              type="button"
              onClick={() => {
                onDiscountChange(null);
                setCodeInput('');
                setCodeMessage(null);
              }}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Quitar
            </button>
          ) : (
            <button
              type="button"
              onClick={handleApplyCode}
              disabled={validating || !codeInput.trim()}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1 cursor-pointer"
            >
              {validating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Aplicar
            </button>
          )}
        </div>
        {codeMessage && (
          <p className={`text-[11px] font-semibold ${discount ? 'text-emerald-700' : 'text-rose-600'}`}>{codeMessage}</p>
        )}
      </div>

      {/* Medio de pago */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5 mb-2">
          <Wallet className="w-4 h-4 text-rose-600" /> ¿Cómo quieres pagar?
        </legend>

        {walletCards.map((card) => (
          <label
            key={card.id}
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
              choice === card.id ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 bg-white hover:border-slate-400'
            }`}
          >
            <input
              type="radio"
              name="payment-method"
              value={card.id}
              checked={choice === card.id}
              onChange={() => setChoice(card.id)}
              className="accent-rose-600"
            />
            <CreditCard className="w-5 h-5 text-slate-700 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-bold text-slate-900">
                {card.cardType} terminada en {card.last4}
              </span>
              <span className="block text-[11px] text-slate-500">Tarjeta de tu billetera · pago inmediato</span>
            </span>
            {card.isDefault && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Predeterminada
              </span>
            )}
          </label>
        ))}

        <label
          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
            choice === 'webpay' ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 bg-white hover:border-slate-400'
          }`}
        >
          <input
            type="radio"
            name="payment-method"
            value="webpay"
            checked={choice === 'webpay'}
            onChange={() => setChoice('webpay')}
            className="accent-rose-600"
          />
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-bold text-slate-900">Otra tarjeta con Webpay Plus</span>
            <span className="block text-[11px] text-slate-500">Débito, crédito o prepago en el formulario de Transbank</span>
          </span>
        </label>

        <button
          type="button"
          onClick={handleAddCard}
          disabled={addingCard || paying || disabled || walletCards.length >= 5}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-slate-300 hover:border-rose-500 text-xs font-bold text-slate-700 hover:text-rose-600 disabled:opacity-50 cursor-pointer"
        >
          {addingCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {walletCards.length === 0 ? 'Agregar una tarjeta a mi billetera' : 'Agregar otra tarjeta'}
        </button>
        {walletCards.length === 0 && (
          <p className="text-[11px] text-slate-500">
            Al agregarla te llevamos a Transbank y luego vuelves aquí con tu reserva lista para pagar.
          </p>
        )}
      </fieldset>

      <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-900 flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Ambiente de pruebas de Transbank (no se realizan cargos reales). Tarjeta VISA <strong>4051 8856 0044 6623</strong>, CVV{' '}
          <strong>123</strong>, cualquier fecha futura; si te pide autenticación usa RUT <strong>11.111.111-1</strong> y clave{' '}
          <strong>123</strong>.
        </span>
      </div>

      {payError && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
          {payError}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={paying}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
          >
            Volver al contrato
          </button>
        )}
        <button
          type="button"
          onClick={handlePay}
          disabled={paying || addingCard || disabled}
          className="ml-auto px-6 py-3 rounded-xl font-bold text-xs text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition flex items-center gap-2 shadow-lg cursor-pointer"
        >
          {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          <span>
            {paying
              ? usingCard
                ? 'Procesando pago…'
                : 'Redirigiendo a webpay…'
              : usingCard && selectedCard
              ? `Pagar ${formatClp(total)} con tarjeta ···· ${selectedCard.last4}`
              : `Pagar ${formatClp(total)} con Webpay Plus`}
          </span>
        </button>
      </div>
    </div>
  );
};
