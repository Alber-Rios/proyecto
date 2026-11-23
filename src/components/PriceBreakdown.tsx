import React from 'react';
import { formatClp } from '../utils/formatters.ts';
import { splitIva } from '../utils/pricing.ts';

// Desglose del precio, igual en toda la web:
//   Arrendatario: valor del arriendo + comisión Spotly 5 % + IVA de la comisión (= total).
//   Propietario:  valor del arriendo − comisión Spotly 10 % − IVA de la comisión (= recibes).
// La comisión de Spotly lleva IVA (la emite Spotly). El arriendo es del propietario:
// exento si no es amoblado; si es amoblado, el precio ya incluye su IVA y lo declara él.

type Row = { label: React.ReactNode; hint?: React.ReactNode; value: number; sign?: '+' | '−'; tone?: 'muted' | 'good' };

const Line: React.FC<Row & { compact?: boolean; sub?: boolean }> = ({ label, hint, value, sign, tone, compact, sub }) => (
  <div className={`flex items-start justify-between gap-3 ${compact || sub ? 'py-0.5' : 'py-1'} ${sub ? 'pl-3 text-[11px] text-slate-500' : ''}`}>
    <span className="min-w-0">
      <span className={tone === 'good' ? 'text-emerald-700' : sub ? 'text-slate-500' : 'text-slate-700'}>{label}</span>
      {hint && <span className="block text-[11px] leading-snug text-slate-500">{hint}</span>}
    </span>
    <span className={`shrink-0 tabular-nums ${sub ? 'text-slate-500' : 'font-semibold'} ${tone === 'good' ? 'text-emerald-700' : sub ? '' : 'text-slate-900'}`}>
      {sign === '−' ? '−' : ''}
      {formatClp(value)}
    </span>
  </div>
);

export const TenantPriceBreakdown: React.FC<{
  rentClp: number;
  rentDetail?: React.ReactNode;
  feeClp: number;
  furnished?: boolean;
  depositClp?: number;
  discount?: { label: React.ReactNode; clp: number } | null;
  totalClp: number;
  totalHint?: React.ReactNode;
  compact?: boolean;
}> = ({ rentClp, rentDetail, feeClp, furnished, depositClp = 0, discount, totalClp, totalHint, compact }) => {
  const fee = splitIva(feeClp);
  return (
    <div className="text-xs">
      <Line
        compact={compact}
        label="Valor del arriendo"
        hint={
          <>
            {rentDetail}
            {rentDetail ? ' · ' : ''}
            {furnished ? 'IVA incluido, lo declara el propietario' : 'exento de IVA'}
          </>
        }
        value={rentClp}
      />
      <Line compact={compact} label="Comisión Spotly (5 % del arriendo)" value={feeClp} />
      <Line sub label="↳ Neto" value={fee.net} />
      <Line sub label="↳ IVA 19 %" value={fee.iva} />
      {depositClp > 0 && <Line compact={compact} label="Garantía" hint="Se devuelve al terminar" value={depositClp} />}
      {discount && discount.clp > 0 && <Line compact={compact} label={discount.label} value={discount.clp} sign="−" tone="good" />}
      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2">
        <span>
          <span className="block text-sm font-bold text-slate-900">Total a pagar</span>
          <span className="block text-[11px] text-slate-500">
            {totalHint ?? 'Arriendo + comisión Spotly (IVA incluido). No hay cobros después.'}
          </span>
        </span>
        <span className="shrink-0 text-base font-bold tabular-nums text-rose-600">{formatClp(totalClp)}</span>
      </div>
    </div>
  );
};

export const OwnerPriceBreakdown: React.FC<{
  rentClp: number;
  rentDetail?: React.ReactNode;
  commissionRate: number;
  /** Comisión ya congelada en la reserva; si no viene, se calcula con la tasa. */
  commissionClp?: number;
  compact?: boolean;
  totalLabel?: string;
}> = ({ rentClp, rentDetail, commissionRate, commissionClp, compact, totalLabel = 'Recibes' }) => {
  const gross = commissionClp ?? Math.round(rentClp * commissionRate);
  const c = splitIva(gross);
  const pct = String(Math.round(commissionRate * 1000) / 10).replace('.', ',');
  return (
    <div className="text-xs">
      <Line compact={compact} label="Valor del arriendo" hint={rentDetail} value={rentClp} />
      <Line compact={compact} label={`Comisión Spotly (${pct} % del arriendo)`} value={gross} sign="−" />
      <Line sub label="↳ Neto" value={c.net} sign="−" />
      <Line sub label="↳ IVA 19 %" value={c.iva} sign="−" />
      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2">
        <span className="text-sm font-bold text-slate-900">{totalLabel}</span>
        <span className="shrink-0 text-base font-bold tabular-nums text-emerald-700">{formatClp(rentClp - gross)}</span>
      </div>
    </div>
  );
};
