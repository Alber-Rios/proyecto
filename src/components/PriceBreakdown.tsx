import React from 'react';
import { formatClp } from '../utils/formatters.ts';
import { ownerCommissionFor, splitIva } from '../utils/pricing.ts';

// Desglose del precio, igual en toda la web (el IVA se suma encima):
//   Arrendatario: arriendo + IVA del arriendo + comisión Spotly 5 % + IVA de la comisión = total.
//   Propietario:  arriendo + IVA del arriendo − comisión Spotly 10 % − IVA de la comisión = recibes.
// El IVA del arriendo solo existe si el espacio es amoblado o equipado (lo declara el propietario);
// el de la comisión lo declara Spotly.

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
  /** Arriendo neto (sin IVA). */
  rentNetClp: number;
  /** IVA del arriendo (19 %); 0 si el espacio no es amoblado. */
  rentIvaClp: number;
  rentDetail?: React.ReactNode;
  /** Comisión Spotly con su IVA. */
  feeClp: number;
  furnished?: boolean;
  depositClp?: number;
  discount?: { label: React.ReactNode; clp: number } | null;
  totalClp: number;
  totalHint?: React.ReactNode;
  compact?: boolean;
}> = ({ rentNetClp, rentIvaClp, rentDetail, feeClp, furnished, depositClp = 0, discount, totalClp, totalHint, compact }) => {
  const fee = splitIva(feeClp);
  const hasIva = rentIvaClp > 0 || furnished;
  return (
    <div className="text-xs">
      <Line compact={compact} label="Arriendo" hint={rentDetail} value={rentNetClp} />
      {hasIva && (
        <>
          <Line compact={compact} label="IVA del arriendo (19 %)" hint="Espacio amoblado o equipado" value={rentIvaClp} />
          <Line compact={compact} label={<strong className="text-slate-900">Total arriendo</strong>} value={rentNetClp + rentIvaClp} />
        </>
      )}
      <div className="my-1 border-t border-dashed border-slate-200" />
      <Line compact={compact} label={`Comisión Spotly (5 % de ${formatClp(rentNetClp)})`} value={fee.net} />
      <Line compact={compact} label="IVA de la comisión (19 %)" value={fee.iva} />
      <Line compact={compact} label={<strong className="text-slate-900">Total comisión</strong>} value={feeClp} />
      {depositClp > 0 && <Line compact={compact} label="Garantía" hint="Se devuelve al terminar" value={depositClp} />}
      {discount && discount.clp > 0 && <Line compact={compact} label={discount.label} value={discount.clp} sign="−" tone="good" />}
      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2">
        <span>
          <span className="block text-sm font-bold text-slate-900">Total a pagar</span>
          <span className="block text-[11px] text-slate-500">
            {totalHint ?? (hasIva ? 'Total arriendo + total comisión. No hay cobros después.' : 'Arriendo + total comisión. No hay cobros después.')}
          </span>
        </span>
        <span className="shrink-0 text-base font-bold tabular-nums text-rose-600">{formatClp(totalClp)}</span>
      </div>
    </div>
  );
};

export const OwnerPriceBreakdown: React.FC<{
  rentNetClp: number;
  rentIvaClp?: number;
  rentDetail?: React.ReactNode;
  commissionRate: number;
  /** Comisión ya congelada en la reserva (con IVA); si no viene, se calcula con la tasa. */
  commissionClp?: number;
  compact?: boolean;
  totalLabel?: string;
}> = ({ rentNetClp, rentIvaClp = 0, rentDetail, commissionRate, commissionClp, compact, totalLabel = 'Recibes' }) => {
  const gross = commissionClp ?? ownerCommissionFor(rentNetClp, commissionRate);
  const c = splitIva(gross);
  const pct = String(Math.round(commissionRate * 1000) / 10).replace('.', ',');
  return (
    <div className="text-xs">
      <Line compact={compact} label="Arriendo" hint={rentDetail} value={rentNetClp} />
      {rentIvaClp > 0 && (
        <>
          <Line compact={compact} label="IVA del arriendo (19 %)" hint="Te lo pagamos; lo declaras tú" value={rentIvaClp} />
          <Line compact={compact} label={<strong className="text-slate-900">Total arriendo</strong>} value={rentNetClp + rentIvaClp} />
        </>
      )}
      <div className="my-1 border-t border-dashed border-slate-200" />
      <Line compact={compact} label={`Comisión Spotly (${pct} % de ${formatClp(rentNetClp)})`} value={c.net} sign="−" />
      <Line compact={compact} label="IVA de la comisión (19 %)" value={c.iva} sign="−" />
      <Line compact={compact} label={<strong className="text-slate-900">Total comisión</strong>} value={gross} sign="−" />
      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2">
        <span className="text-sm font-bold text-slate-900">{totalLabel}</span>
        <span className="shrink-0 text-base font-bold tabular-nums text-emerald-700">{formatClp(rentNetClp + rentIvaClp - gross)}</span>
      </div>
    </div>
  );
};
