import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { LEGAL_ENTITY } from '../data/legalEntity.ts';
import type { PaymentRecord, Reservation } from '../types.ts';
import { formatRut } from '../utils/formatters.ts';
import { computeRentTax, rentalDays } from '../utils/rentTax.ts';
import { getTaxDocuments, type TaxDocument } from '../lib/financeApi.ts';

// Comprobante con formato de boleta térmica (como las del comercio en Chile).
// No es un DTE: la boleta electrónica real necesita folio y timbre del SII,
// que se agregan al conectar un emisor (SII, OpenFactura, Bsale, etc.).

type Variant = 'tenant' | 'owner';

const peso = (n: number) => `$ ${Math.round(n).toLocaleString('es-CL')}`;
const netOf = (gross: number) => Math.round(gross / 1.19);
const placeholder = (v: string) => (v.startsWith('[') ? '' : v);

function receiptNumber(r: Reservation) {
  const digits = r.id.replace(/\D/g, '');
  return (digits.slice(-8) || r.id.slice(-8)).padStart(8, '0');
}

function fmtDateTime(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const date = d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

function nextTuesday(fromIso?: string) {
  const d = fromIso ? new Date(fromIso.slice(0, 10) + 'T12:00:00') : new Date();
  const add = ((9 - (d.getDay() || 7)) % 7) || 7;
  d.setDate(d.getDate() + add);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function unitsLabel(r: Reservation) {
  if (r.rentalModality === 'por_hora' && r.hourStart !== undefined && r.hourEnd !== undefined) return { qty: r.hourEnd - r.hourStart, unit: 'h' };
  if (r.rentalModality === 'mensual') {
    const qty = r.durationUnits || 1;
    return { qty, unit: qty === 1 ? 'mes' : 'meses' };
  }
  const qty = r.durationUnits || r.totalDays || 1;
  return { qty, unit: qty === 1 ? 'día' : 'días' };
}

const Line: React.FC<{ k: React.ReactNode; v: React.ReactNode; strong?: boolean; className?: string }> = ({ k, v, strong, className = '' }) => (
  <div className={`flex items-baseline justify-between gap-3 ${strong ? 'font-bold' : ''} ${className}`}>
    <span className="min-w-0">{k}</span>
    <span className="shrink-0 tabular-nums">{v}</span>
  </div>
);

const Rule: React.FC<{ double?: boolean }> = ({ double }) => (
  <div aria-hidden="true" className={`my-2 border-t border-dashed border-stone-400 ${double ? 'border-b pb-[2px]' : ''}`} />
);

/** Timbre electrónico: código PDF417 con el TED, como en las boletas del SII. */
const Pdf417Stamp: React.FC<{ ted: string }> = ({ ted }) => {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import('@bwip-js/browser')
      .then(({ pdf417, drawingSVG }) => {
        const out = pdf417({ bcid: 'pdf417', text: ted, columns: 8, eclevel: 5, rowmult: 2, padding: 0 } as never, drawingSVG());
        if (alive) setSvg(out);
      })
      .catch(() => alive && setSvg(''));
    return () => {
      alive = false;
    };
  }, [ted]);
  if (svg === null) return <div className="h-24 animate-pulse bg-stone-200" aria-hidden="true" />;
  if (!svg) return null;
  return (
    <div
      role="img"
      aria-label="Timbre electrónico simulado (código PDF417)"
      className="[&>svg]:h-auto [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

const Section: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <section className="space-y-0.5">
    <p className="text-[11px] font-bold">{title}</p>
    {note && <p className="text-[10px] uppercase text-stone-600">{note}</p>}
    <div className="space-y-0.5 pl-2">{children}</div>
  </section>
);

const daysLabel = (d: number) => {
  const v = Math.round(d * 100) / 100;
  return `${String(v).replace('.', ',')} ${v === 1 ? 'DÍA' : 'DÍAS'}`;
};

export const ReceiptPaper: React.FC<{
  reservation: Reservation;
  payment?: PaymentRecord;
  furnished: boolean;
  avaluoFiscalClp?: number;
  variant: Variant;
  /** Documentos tributarios simulados de la reserva. */
  documents?: TaxDocument[];
}> = ({ reservation: r, payment, furnished, avaluoFiscalClp, variant, documents = [] }) => {
  const concept = variant === 'tenant' ? 'cargo_servicio' : 'comision_propietario';
  const boleta = documents.find((d) => d.docType === 39 && d.concept === concept);
  const creditNote = documents.find((d) => d.docType === 61 && d.concept === concept);
  const issuerName = placeholder(LEGAL_ENTITY.name) || 'SPOTLY';
  const issuerRut = placeholder(LEGAL_ENTITY.rut);
  const issuerAddress = placeholder(LEGAL_ENTITY.address);
  const { qty, unit } = unitsLabel(r);
  const unitPrice = qty > 0 ? Math.round(r.subtotalClp / qty) : r.subtotalClp;
  const fee = r.platformFeeClp || 0;
  const feeNet = netOf(fee);
  const discount = r.discountClp || 0;
  const deposit = r.securityDepositClp || 0;
  const commission = r.ownerCommissionClp || 0;
  const commissionNet = netOf(commission);
  const commissionPct = String(Math.round((r.ownerCommissionRate || 0) * 1000) / 10).replace('.', ',');
  const paidAt = payment?.transactionDate || r.paidAt || r.confirmedAt || r.createdAt;
  const refunded = r.refundAmountClp || payment?.refundedAmountClp || 0;
  const ownerGets = r.subtotalClp - commission;
  const tax = furnished && avaluoFiscalClp ? computeRentTax(r.subtotalClp, avaluoFiscalClp, rentalDays(r)) : null;
  const modality =
    r.rentalModality === 'por_hora' ? 'POR HORA' : r.rentalModality === 'mensual' ? 'MENSUAL' : r.rentalModality === 'abierto' ? 'ABIERTO' : 'POR DÍA';

  const rentTaxBlock = (who: 'tenant' | 'owner') =>
    !furnished ? (
      <Section title={who === 'tenant' ? `B) ARRIENDO · DEL PROPIETARIO` : 'IVA DE TU ARRIENDO'} note="Sin amoblar: exento de IVA">
        <Line k="RENTA" v={peso(r.subtotalClp)} />
        <Line k="IVA" v="EXENTO" />
      </Section>
    ) : tax ? (
      <Section
        title={who === 'tenant' ? 'B) ARRIENDO AMOBLADO · DEL PROPIETARIO' : 'IVA DE TU ARRIENDO · LO DECLARAS TÚ'}
        note="IVA incluido en el precio · art. 17 DL 825"
      >
        <Line k="RENTA NETA" v={peso(tax.net)} />
        <Line k={`REBAJA AVALÚO 11% · ${daysLabel(tax.days)}`} v={`-${peso(tax.rebate)}`} />
        <Line k="BASE IMPONIBLE" v={peso(tax.base)} />
        <Line k="IVA 19%" v={peso(tax.iva)} />
        <Line k="TOTAL ARRIENDO" v={peso(r.subtotalClp)} strong />
        <p className="text-[10px] text-stone-600">AVALÚO FISCAL DECLARADO: {peso(avaluoFiscalClp || 0)}</p>
      </Section>
    ) : (
      <Section
        title={who === 'tenant' ? 'B) ARRIENDO AMOBLADO · DEL PROPIETARIO' : 'IVA DE TU ARRIENDO · LO DECLARAS TÚ'}
        note="IVA incluido en el precio"
      >
        <Line k="TOTAL ARRIENDO" v={peso(r.subtotalClp)} />
        <p className="text-[10px] uppercase text-stone-600">
          {who === 'tenant'
            ? 'El propietario calcula el IVA con el avalúo fiscal de su propiedad y emite su boleta o factura.'
            : 'Agrega el avalúo fiscal en tu publicación y aquí verás el detalle: renta neta, rebaja, base imponible e IVA.'}
        </p>
      </Section>
    );

  return (
    <article
      className="receipt-paper mx-auto w-full max-w-[22rem] bg-[#fffdf8] px-5 pb-8 pt-5 font-mono text-[12px] leading-[1.45] text-stone-900 shadow-[0_10px_30px_rgba(15,10,25,0.18)]"
      aria-label={variant === 'tenant' ? 'Comprobante de pago' : 'Liquidación para el propietario'}
    >
      <div className="bg-stone-900 py-1.5 text-center text-[17px] font-bold tracking-[0.12em] text-[#fffdf8]">
        {boleta ? `BOLETA N° ${boleta.folio}` : `${variant === 'tenant' ? 'RESERVA' : 'LIQUIDACIÓN'}: ${receiptNumber(r)}`}
      </div>
      {boleta?.simulated && (
        <p className="mt-1 border border-stone-900 py-0.5 text-center text-[10.5px] font-bold uppercase tracking-wide">
          Simulación · sin valor tributario
        </p>
      )}

      <header className="mt-3 text-center uppercase">
        <p className="text-[13.5px] font-bold">{issuerName}</p>
        {issuerRut && <p>R.U.T. {issuerRut}</p>}
        <p>Giro: intermediación de arriendos</p>
        {issuerAddress && <p className="text-[11px]">{issuerAddress}</p>}
        <p className="mt-1 text-[13px] font-bold">
          {boleta ? 'Boleta electrónica' : variant === 'tenant' ? 'Comprobante de pago' : 'Liquidación de arriendo'}
        </p>
        {boleta && (
          <p className="text-[11px]">
            {variant === 'tenant' ? 'Por el cargo de servicio' : 'Por la comisión de intermediación'} · folio {boleta.folio}
          </p>
        )}
      </header>

      <div className="mt-2 space-y-0.5 text-[11px]">
        <Line k="FECHA EMISIÓN:" v={fmtDateTime(boleta?.issuedAt || paidAt)} />
        <Line k="RESERVA:" v={<span className="break-all text-[10.5px]">#{r.id}</span>} />
        <Line k="CLIENTE:" v={<span className="uppercase">{r.tenantName}</span>} />
        {r.tenantRut && <Line k="RUT CLIENTE:" v={formatRut(r.tenantRut)} />}
        <Line k="PROPIETARIO:" v={<span className="uppercase">{r.ownerName}</span>} />
        {r.ownerRut && <Line k="RUT PROPIETARIO:" v={formatRut(r.ownerRut)} />}
        <Line k="ESPACIO:" v={<span className="block max-w-[12rem] truncate text-right uppercase">{r.spaceTitle}</span>} />
        {r.spaceAddress && <Line k="DIRECCIÓN:" v={<span className="block max-w-[12rem] truncate text-right uppercase">{r.spaceAddress}</span>} />}
        <Line k="MODALIDAD:" v={`${modality}${furnished ? ' · AMOBLADO' : ''}`} />
        <Line k="FECHAS:" v={r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`} />
        {r.rentalModality === 'por_hora' && r.hourStart !== undefined && r.hourEnd !== undefined && (
          <Line k="HORARIO:" v={`${String(r.hourStart).padStart(2, '0')}:00 - ${String(r.hourEnd).padStart(2, '0')}:00`} />
        )}
      </div>

      <Rule double />
      <div className="flex justify-between text-[11px] font-bold">
        <span>DESCRIPCIÓN</span>
        <span>CANT X PRECIO&nbsp;&nbsp;VALOR</span>
      </div>
      <Rule double />

      {variant === 'tenant' ? (
        <div className="space-y-1.5">
          <div>
            <p className="uppercase">Arriendo {furnished ? 'amoblado (IVA incl.)' : 'sin amoblar'}</p>
            <Line k={<span className="pl-2 text-stone-600">{qty} {unit} x {peso(unitPrice)}</span>} v={peso(r.subtotalClp)} />
          </div>
          <Line k="CARGO SERVICIO SPOTLY 5%" v={peso(fee)} />
          {deposit > 0 && <Line k="GARANTÍA (SE DEVUELVE)" v={peso(deposit)} />}
          {discount > 0 && <Line k={`DESCUENTO ${r.discountCode || ''}`.trim()} v={`-${peso(discount)}`} />}
          <Rule />
          <Line k={<span className="text-[15px]">TOTAL</span>} v={<span className="text-[15px]">{peso(r.totalClp)}</span>} strong />

          <Rule double />
          <p className="text-center text-[11px] font-bold">DETALLE DE IMPUESTOS</p>
          <Section title="A) SERVICIO SPOTLY · LO EMITE SPOTLY" note="Afecto a IVA">
            <Line k="TOTAL NETO" v={peso(feeNet)} />
            <Line k="IVA 19%" v={peso(fee - feeNet)} />
            <Line k="TOTAL SERVICIO" v={peso(fee)} strong />
          </Section>
          {rentTaxBlock('tenant')}
          {deposit > 0 && (
            <Section title="C) GARANTÍA" note="No es venta ni servicio: no lleva IVA">
              <Line k="EN CUSTODIA" v={peso(deposit)} />
            </Section>
          )}
          <Rule />
          <Line k="IVA TOTAL INCLUIDO" v={tax || !furnished ? peso(fee - feeNet + (tax?.iva || 0)) : `${peso(fee - feeNet)} + IVA ARRIENDO`} strong />

          <Rule double />
          <p className="text-center text-[11px] font-bold">PAGO</p>
          <Line k={payment?.cardLast4 ? `WEBPAY ****${payment.cardLast4}` : 'WEBPAY'} v={peso(payment?.amountClp ?? r.totalClp)} />
          <Line k="CUOTAS" v={payment?.installmentsNumber ? payment.installmentsNumber : 'SIN CUOTAS'} />
          {payment?.authorizationCode && <Line k="COD. AUTORIZACIÓN" v={payment.authorizationCode} />}
          {payment?.buyOrder && <Line k="ORDEN DE COMPRA" v={<span className="text-[10.5px]">{payment.buyOrder}</span>} />}
          {refunded > 0 && <Line k="DEVUELTO" v={`-${peso(refunded)}`} strong />}
          <p className="pt-1 text-[10px] uppercase text-stone-600">
            Spotly cobra el arriendo por cuenta del propietario (mandato de cobro) y se lo transfiere, menos su comisión.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div>
            <p className="uppercase">Arriendo cobrado</p>
            <Line k={<span className="pl-2 text-stone-600">{qty} {unit} x {peso(unitPrice)}</span>} v={peso(r.subtotalClp)} />
          </div>
          <Line k={`COMISIÓN SPOTLY ${commissionPct}%`} v={commission ? `-${peso(commission)}` : peso(0)} />
          <Rule />
          <Line k={<span className="text-[15px]">A DEPOSITAR</span>} v={<span className="text-[15px]">{peso(ownerGets)}</span>} strong />
          <Line k="DEPÓSITO" v={r.status === 'completed' ? `MARTES ${nextTuesday(r.endDate)}` : 'MARTES TRAS EL ARRIENDO'} />
          {deposit > 0 && <Line k="GARANTÍA EN CUSTODIA" v={peso(deposit)} />}

          <Rule double />
          <p className="text-center text-[11px] font-bold">DETALLE DE IMPUESTOS</p>
          {rentTaxBlock('owner')}
          {commission > 0 && (
            <Section title="COMISIÓN SPOTLY · LA EMITE SPOTLY" note="Afecta a IVA · IVA incluido">
              <Line k="TOTAL NETO" v={peso(commissionNet)} />
              <Line k="IVA 19%" v={peso(commission - commissionNet)} />
              <Line k="TOTAL COMISIÓN" v={peso(commission)} strong />
            </Section>
          )}
          {tax && (
            <>
              <Rule />
              <Line k="DEPÓSITO MENOS TU IVA" v={peso(ownerGets - tax.iva)} strong />
              <p className="text-[10px] uppercase text-stone-600">Estimado: confirma con tu contador antes de declarar.</p>
            </>
          )}
        </div>
      )}

      {creditNote && (
        <>
          <Rule double />
          <p className="text-center text-[11px] font-bold">NOTA DE CRÉDITO N° {creditNote.folio}</p>
          <Line k={`ANULA BOLETA N° ${creditNote.referencesFolio ?? ''}`} v={`-${peso(creditNote.totalClp)}`} strong />
          <p className="text-[10px] uppercase text-stone-600">Se devolvió el cargo de servicio completo.</p>
        </>
      )}

      {boleta ? (
        <div className="mt-5 space-y-1 text-center">
          <Pdf417Stamp ted={boleta.ted} />
          <p className="text-[10.5px] font-bold uppercase">Timbre electrónico S.I.I. (simulado)</p>
          <p className="text-[10px] uppercase text-stone-600">
            Documento de demostración para proyecto de título. No es una boleta válida ante el SII.
          </p>
          <p className="text-[10px] text-stone-600">Emitida {fmtDateTime(boleta.issuedAt)}</p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex min-h-[4.5rem] items-center justify-center border-2 border-dashed border-stone-400 px-3 text-center text-[10.5px] uppercase text-stone-600">
            {variant === 'owner' && !(r.ownerCommissionClp > 0)
              ? 'Sin comisión: no corresponde boleta'
              : 'La boleta se emite al confirmarse el pago'}
          </div>
          <p className="mt-3 text-center text-[10.5px] uppercase">Este comprobante no reemplaza la boleta electrónica del SII</p>
        </>
      )}
      <p className="mt-2 text-center text-[11px]">Gracias por usar Spotly</p>
    </article>
  );
};

export const PaymentReceiptModal: React.FC<{ reservation: Reservation; variant: Variant; onClose: () => void }> = ({ reservation, variant, onClose }) => {
  const { payments, spaces } = useApp();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const payment = payments.find(
    (p) => p.reservationId === reservation.id && ['authorized', 'refunded', 'partially_refunded'].includes(p.status),
  );
  const space = spaces.find((s) => s.id === reservation.spaceId);
  const furnished = Boolean(space?.isFurnished);
  const [documents, setDocuments] = useState<TaxDocument[]>([]);
  useEffect(() => {
    let alive = true;
    getTaxDocuments(reservation.id).then((d) => alive && setDocuments(d));
    return () => {
      alive = false;
    };
  }, [reservation.id]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('receipt-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('receipt-open');
    };
  }, [onClose]);

  return createPortal(
    <div
      className="receipt-modal fixed inset-0 z-[80] overflow-y-auto overscroll-contain bg-slate-950/70 px-4 py-6 backdrop-blur-xs sm:py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div className="mx-auto flex max-w-[24rem] flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-actions flex items-center justify-between gap-2">
          <h2 id={titleId} className="text-sm font-bold text-white">
            {variant === 'tenant' ? 'Comprobante de pago' : 'Liquidación del arriendo'}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 active:scale-[0.97] cursor-pointer"
            >
              <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir o PDF
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white transition hover:bg-white/25 cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <ReceiptPaper reservation={reservation} payment={payment} furnished={furnished} avaluoFiscalClp={space?.avaluoFiscalClp} variant={variant} documents={documents} />
      </div>
    </div>,
    document.body,
  );
};
