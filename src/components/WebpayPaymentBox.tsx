import React, { useState } from 'react';
import { formatClp } from '../utils/formatters.ts';
import { validateDiscountCode } from '../lib/dataAccess.ts';
import { Lock, ShieldCheck, Tag, Loader2, X, Info } from 'lucide-react';

export interface AppliedDiscount {
  code: string;
  discountClp: number;
  percentOff?: number;
  maxDiscountClp?: number | null;
}

interface WebpayPaymentBoxProps {
  units: number;
  unitLabel: string;
  basePrice: number;
  subtotalClp: number;
  platformFeeClp: number;
  depositClp: number;
  discount: AppliedDiscount | null;
  onDiscountChange: (discount: AppliedDiscount | null) => void;
  onPay: () => Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
}

// Checkout con Webpay Plus (RF-17): el pago se realiza en el formulario oficial de
// Transbank; Spotly nunca recibe ni almacena datos de tarjetas.
export const WebpayPaymentBox: React.FC<WebpayPaymentBoxProps> = ({
  units,
  unitLabel,
  basePrice,
  subtotalClp,
  platformFeeClp,
  depositClp,
  discount,
  onDiscountChange,
  onPay,
  onCancel,
  disabled,
}) => {
  const [codeInput, setCodeInput] = useState('');
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const discountClp = discount?.discountClp || 0;
  const total = subtotalClp + platformFeeClp + depositClp - discountClp;

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
      await onPay();
      // Si todo sale bien el navegador ya fue redirigido a Transbank.
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'No se pudo iniciar el pago.');
      setPaying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 text-white rounded-2xl p-4 border border-slate-800 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm font-black tracking-tight">Webpay Plus</span>
            <p className="text-[11px] text-slate-300">
              Pagarás en el formulario seguro de Transbank. Spotly no recibe los datos de tu tarjeta.
            </p>
          </div>
          <ShieldCheck className="w-8 h-8 text-emerald-400 shrink-0" />
        </div>
      </div>

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
        <div className="flex justify-between">
          <span className="text-slate-600">Garantía reembolsable</span>
          <span className="font-bold text-slate-900">{formatClp(depositClp)}</span>
        </div>
        {discount && (
          <div className="flex justify-between text-emerald-700">
            <span className="flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" /> Descuento {discount.code}
            </span>
            <span className="font-bold">−{formatClp(discountClp)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-200 pt-2 text-sm">
          <span className="font-black text-slate-900">Total a pagar</span>
          <span className="font-black text-rose-600">{formatClp(total)}</span>
        </div>
      </div>

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

      <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-900 flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Ambiente de integración de Transbank (no se realizan cargos reales). Tarjeta de prueba VISA{' '}
          <strong>4051 8856 0044 6623</strong>, CVV <strong>123</strong>, cualquier fecha futura; en la autenticación usa RUT{' '}
          <strong>11.111.111-1</strong> y clave <strong>123</strong>.
        </span>
      </div>

      {payError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">{payError}</div>
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
          disabled={paying || disabled}
          className="ml-auto px-6 py-3 rounded-xl font-bold text-xs text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition flex items-center gap-2 shadow-lg cursor-pointer"
        >
          {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          <span>{paying ? 'Redirigiendo a Webpay…' : `Pagar ${formatClp(total)} con Webpay Plus`}</span>
        </button>
      </div>
    </div>
  );
};
