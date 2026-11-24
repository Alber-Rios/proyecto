import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { LEGAL_ENTITY } from '../data/legalEntity.ts';
import type { PaymentRecord, Reservation } from '../types.ts';
import { formatRut } from '../utils/formatters.ts';
import { getMyPayouts, getTaxDocuments, getTaxStatus, type TaxDocument } from '../lib/financeApi.ts';

// Comprobante con formato de boleta térmica (como las del comercio en Chile).
// No es un DTE: la boleta electrónica real necesita folio y timbre del SII,
// que se agregan al conectar un emisor (SII, OpenFactura, Bsale, etc.).

type Variant = 'tenant' | 'owner';

const peso = (n: number) => `$ ${Math.round(n).toLocaleString('es-CL')}`;
const netOf = (gross: number) => Math.round(gross / 1.19);
const placeholder = (v: string) => (v.startsWith('[') ? '' : v);

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

type Kind = 'summary' | 'boleta';

/**
 * Cada persona ve solo lo suyo, en dos documentos separados:
 * - Arrendatario: «Comprobante de pago» (arriendo + comisión Spotly 5 % + IVA de la comisión) y la boleta de Spotly por esa comisión.
 * - Propietario: «Liquidación» (lo que recibe y su IVA) y la boleta de Spotly por la comisión.
 * El arrendatario nunca ve la comisión, el avalúo ni el IVA del propietario;
 * el propietario nunca ve la comisión del arrendatario, el descuento, la tarjeta ni el RUT del arrendatario.
 */
export const ReceiptPaper: React.FC<{
  reservation: Reservation;
  payment?: PaymentRecord;
  furnished: boolean;
  avaluoFiscalClp?: number;
  variant: Variant;
  kind?: Kind;
  /** Documentos tributarios simulados de la reserva. */
  documents?: TaxDocument[];
  /** Anticipo de IVA retenido en la liquidación (Ley 21.713). */
  ivaWithheldClp?: number;
  /** Giro del propietario en el SII (va en la factura como dato del receptor). */
  recipientGiro?: string | null;
}> = ({ reservation: r, payment, furnished, avaluoFiscalClp, variant, kind = 'summary', documents = [], ivaWithheldClp = 0, recipientGiro }) => {
  const isTenant = variant === 'tenant';
  const concept = isTenant ? 'cargo_servicio' : 'comision_propietario';
  // Documento de Spotly por su comisión: boleta (39) o, al propietario con inicio de
  // actividades, factura (33) para que use el IVA como crédito fiscal.
  const boleta = documents.find((d) => (d.docType === 39 || d.docType === 33) && d.concept === concept);
  const isFactura = boleta?.docType === 33;
  const docName = isFactura ? 'FACTURA' : 'BOLETA';
  const creditNote = documents.find((d) => d.docType === 61 && d.concept === concept);
  const issuerName = placeholder(LEGAL_ENTITY.name) || 'SPOTLY';
  const issuerRut = placeholder(LEGAL_ENTITY.rut) || 'POR DEFINIR';
  const issuerAddress = placeholder(LEGAL_ENTITY.address);
  const { qty, unit } = unitsLabel(r);
  const fee = r.platformFeeClp || 0;
  const discount = r.discountClp || 0;
  const deposit = r.securityDepositClp || 0;
  const commission = r.ownerCommissionClp || 0;
  const commissionPct = String(Math.round((r.ownerCommissionRate || 0) * 1000) / 10).replace('.', ',');
  const paidAt = payment?.transactionDate || r.paidAt || r.confirmedAt || r.createdAt;
  const refunded = r.refundAmountClp || payment?.refundedAmountClp || 0;
  const ownerGets = r.subtotalClp - commission - ivaWithheldClp;
  const rentIva = r.rentIvaClp || 0;
  const rentNet = r.subtotalClp - rentIva;
  const unitNet = qty > 0 ? Math.round(rentNet / qty) : rentNet;
  const modality =
    r.rentalModality === 'por_hora' ? 'POR HORA' : r.rentalModality === 'mensual' ? 'MENSUAL' : r.rentalModality === 'abierto' ? 'ABIERTO' : 'POR DÍA';
  const showBoleta = kind === 'boleta' && Boolean(boleta);
  const boletaGross = boleta?.totalClp ?? (isTenant ? fee : commission);
  const boletaNet = boleta?.netClp ?? netOf(boletaGross);
  const boletaIva = boleta?.ivaClp ?? boletaGross - boletaNet;

  const title = showBoleta ? `${docName} N° ${boleta!.folio}` : isTenant ? 'COMPROBANTE DE PAGO' : 'LIQUIDACIÓN';
  const label = showBoleta ? `${isFactura ? 'Factura' : 'Boleta'} electrónica de Spotly` : isTenant ? 'Comprobante de pago' : 'Liquidación para el propietario';
  const feeNet = netOf(fee);
  const feeIva = fee - feeNet;
  const comNet = netOf(commission);
  const comIva = commission - comNet;

  // Datos de la reserva: cada uno ve su propio RUT completo; del otro, solo el nombre.
  const rawRut = (showBoleta ? boleta?.recipientRut : null) || (isTenant ? r.tenantRut : r.ownerRut) || '';
  const myRut = rawRut ? formatRut(rawRut) : '';
  const reservationData = (
    <div className="mt-2 space-y-0.5 text-[11px]">
      <Line k="FECHA:" v={fmtDateTime(showBoleta ? boleta!.issuedAt : paidAt)} />
      <Line k="RESERVA:" v={<span className="break-all text-[10.5px]">{r.id.toUpperCase()}</span>} />
      {isTenant ? (
        <>
          <Line k="CLIENTE:" v={<span className="uppercase">{r.tenantName}</span>} />
          {myRut && <Line k="RUT:" v={myRut} />}
          {!showBoleta && <Line k="PROPIETARIO:" v={<span className="uppercase">{r.ownerName}</span>} />}
        </>
      ) : (
        <>
          <Line k={showBoleta ? 'CLIENTE:' : 'PROPIETARIO:'} v={<span className="uppercase">{r.ownerName}</span>} />
          {myRut && <Line k="RUT:" v={myRut} />}
          {showBoleta && isFactura && recipientGiro && <Line k="GIRO:" v={<span className="block max-w-[12rem] text-right uppercase">{recipientGiro}</span>} />}
          {!showBoleta && <Line k="ARRENDATARIO:" v={<span className="uppercase">{r.tenantName}</span>} />}
        </>
      )}
      <Line k="ESPACIO:" v={<span className="block max-w-[12rem] truncate text-right uppercase">{r.spaceTitle}</span>} />
      {!showBoleta && (
        <>
          {r.spaceAddress && <Line k="DIRECCIÓN:" v={<span className="block max-w-[12rem] truncate text-right uppercase">{r.spaceAddress}</span>} />}
          <Line k="MODALIDAD:" v={`${modality}${furnished ? ' · AMOBLADO' : ''}`} />
          <Line k="FECHAS:" v={r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`} />
          {r.rentalModality === 'por_hora' && r.hourStart !== undefined && r.hourEnd !== undefined && (
            <Line k="HORARIO:" v={`${String(r.hourStart).padStart(2, '0')}:00 - ${String(r.hourEnd).padStart(2, '0')}:00`} />
          )}
        </>
      )}
    </div>
  );

  const tableHead = (
    <>
      <Rule double />
      <div className="flex justify-between text-[11px] font-bold">
        <span>DESCRIPCIÓN</span>
        <span>VALOR</span>
      </div>
      <Rule double />
    </>
  );

  let body: React.ReactNode;
  if (showBoleta) {
    // Solo el servicio que vende Spotly a esta persona.
    body = (
      <div className="space-y-1.5">
        {tableHead}
        <Line k={isTenant ? 'COMISIÓN SPOTLY 5%' : `COMISIÓN SPOTLY ${commissionPct}%`} v={peso(boletaGross)} />
        <Rule />
        <Line k="MONTO NETO" v={peso(boletaNet)} />
        <Line k="IVA 19%" v={peso(boletaIva)} />
        <Line k={<span className="text-[15px]">TOTAL</span>} v={<span className="text-[15px]">{peso(boletaGross)}</span>} strong />
        {!isTenant && <p className="text-[10px] uppercase text-stone-600">Se descontó de tu depósito. No pagas nada aparte.</p>}
        {isFactura && (
          <p className="text-[10px] uppercase text-stone-600">
            Usa este IVA ({peso(boletaIva)}) como crédito fiscal en tu declaración mensual (F29).
          </p>
        )}
        {creditNote && (
          <>
            <Rule double />
            <p className="text-center text-[11px] font-bold">NOTA DE CRÉDITO N° {creditNote.folio}</p>
            <Line k={`ANULA ${docName} N° ${creditNote.referencesFolio ?? boleta!.folio}`} v={`-${peso(creditNote.totalClp)}`} strong />
            <p className="text-[10px] uppercase text-stone-600">
              {isTenant ? 'Se te devolvió la comisión de Spotly completa.' : 'La comisión se anuló.'}
            </p>
          </>
        )}
      </div>
    );
  } else if (isTenant) {
    // Cada cobro con su IVA y su total: arriendo (IVA solo si es amoblado) y comisión Spotly.
    body = (
      <div className="space-y-1.5">
        {tableHead}
        <Line k={`ARRIENDO ${qty} ${unit} x ${peso(unitNet)}`} v={peso(rentNet)} />
        {rentIva > 0 && (
          <>
            <Line k="IVA 19% ARRIENDO" v={peso(rentIva)} />
            <Line k="TOTAL ARRIENDO" v={peso(rentNet + rentIva)} strong />
          </>
        )}
        <Rule />
        <Line k="COMISIÓN SPOTLY 5%" v={peso(feeNet)} />
        <Line k="IVA 19% COMISIÓN" v={peso(feeIva)} />
        <Line k="TOTAL COMISIÓN" v={peso(fee)} strong />
        {(deposit > 0 || discount > 0) && (
          <>
            <Rule />
            {deposit > 0 && <Line k="GARANTÍA (SE DEVUELVE)" v={peso(deposit)} />}
            {discount > 0 && <Line k={`DESCUENTO ${r.discountCode || ''}`.trim()} v={`-${peso(discount)}`} />}
          </>
        )}
        <Rule double />
        <Line
          k={<span className="text-[15px]">{refunded > 0 ? 'TOTAL PAGADO' : 'TOTAL A PAGAR'}</span>}
          v={<span className="text-[15px]">{peso(r.totalClp)}</span>}
          strong
        />
        {refunded > 0 && (
          <>
            <Line k={r.paymentStatus === 'refund_pending' ? 'DEVOLUCIÓN EN CURSO' : 'DEVUELTO'} v={`-${peso(refunded)}`} />
            <Line k={<span className="text-[15px]">COBRO FINAL</span>} v={<span className="text-[15px]">{peso(Math.max(r.totalClp - refunded, 0))}</span>} strong />
          </>
        )}

        <Rule double />
        <p className="text-center text-[11px] font-bold">PAGO</p>
        <Line k={payment?.cardLast4 ? `WEBPAY ****${payment.cardLast4}` : 'WEBPAY'} v={peso(payment?.amountClp ?? r.totalClp)} />
        <Line k="CUOTAS" v={payment?.installmentsNumber ? payment.installmentsNumber : 'SIN CUOTAS'} />
        {payment?.authorizationCode && <Line k="COD. AUTORIZACIÓN" v={payment.authorizationCode} />}
        {boleta && (
          <p className="pt-1 text-[10px] uppercase text-stone-600">
            La comisión tiene su {docName.toLowerCase()} N° {boleta.folio} (pestaña «{isFactura ? 'Factura' : 'Boleta'} Spotly»).
          </p>
        )}
      </div>
    );
  } else {
    // Arriendo (con su IVA si es amoblado) menos la comisión Spotly con su IVA.
    body = (
      <div className="space-y-1.5">
        {tableHead}
        <Line k={`ARRIENDO ${qty} ${unit} x ${peso(unitNet)}`} v={peso(rentNet)} />
        {rentIva > 0 && (
          <>
            <Line k="IVA 19% ARRIENDO" v={`+${peso(rentIva)}`} />
            <Line k="TOTAL ARRIENDO" v={peso(rentNet + rentIva)} strong />
          </>
        )}
        <Rule />
        <Line k={`COMISIÓN SPOTLY ${commissionPct}%`} v={`-${peso(comNet)}`} />
        <Line k="IVA 19% COMISIÓN" v={`-${peso(comIva)}`} />
        <Line k="TOTAL COMISIÓN" v={`-${peso(commission)}`} strong />
        {ivaWithheldClp > 0 && (
          <>
            <Rule />
            <Line k="ANTICIPO IVA RETENIDO" v={`-${peso(ivaWithheldClp)}`} strong />
            <p className="pl-2 text-[10px] uppercase text-stone-600">
              Ley 21.713: no acreditaste cumplimiento tributario vigente. Lo descuentas en tu F29.
            </p>
          </>
        )}
        <Rule double />
        <Line k={<span className="text-[15px]">TOTAL A DEPOSITAR</span>} v={<span className="text-[15px]">{peso(ownerGets)}</span>} strong />
        <Line k="DEPÓSITO" v={r.status === 'completed' ? `MARTES ${nextTuesday(r.endDate)}` : 'MARTES TRAS EL ARRIENDO'} />
        {deposit > 0 && <Line k="GARANTÍA EN CUSTODIA" v={peso(deposit)} />}
        {rentIva > 0 && (
          <p className="pt-1 text-[10px] uppercase text-stone-600">El IVA del arriendo ({peso(rentIva)}) lo declaras tú en tu F29.</p>
        )}
        <p className="text-[10px] uppercase text-stone-600">
          {boleta
            ? isFactura
              ? `La comisión tiene su factura N° ${boleta.folio} (pestaña «Factura Spotly»). Su IVA (${peso(comIva)}) lo recuperas como crédito fiscal en tu F29.`
              : `La comisión tiene su boleta N° ${boleta.folio} (pestaña «Boleta Spotly»).`
            : 'El documento de la comisión se emite al liquidar.'}
        </p>
      </div>
    );
  }

  return (
    <article
      className="receipt-paper mx-auto w-full max-w-[22rem] bg-[#fffdf8] px-5 pb-8 pt-5 font-mono text-[12px] leading-[1.45] text-stone-900 shadow-[0_10px_30px_rgba(15,10,25,0.18)]"
      aria-label={label}
    >
      <div className="bg-stone-900 py-1.5 text-center text-[17px] font-bold tracking-[0.12em] text-[#fffdf8]">{title}</div>
      {showBoleta && boleta!.simulated && (
        <p className="mt-1 border border-stone-900 py-0.5 text-center text-[10.5px] font-bold uppercase tracking-wide">
          Simulación · sin valor tributario
        </p>
      )}
      {(r.status === 'cancelled' || refunded > 0) && !showBoleta && (
        <p className="mt-2 bg-stone-200 py-1 text-center text-[11px] font-bold uppercase tracking-wide">
          Reserva cancelada{refunded > 0 ? (r.paymentStatus === 'refund_pending' ? ' · devolución en curso' : ' · con devolución') : ''}
        </p>
      )}

      <header className="mt-3 text-center uppercase">
        <p className="text-[13.5px] font-bold">{issuerName}</p>
        <p>R.U.T. {issuerRut}</p>
        <p>Giro: intermediación de arriendos</p>
        {issuerAddress && <p className="text-[11px]">{issuerAddress}</p>}
        {showBoleta && <p className="mt-1 text-[13px] font-bold">{isFactura ? 'Factura electrónica' : 'Boleta electrónica'}</p>}
      </header>

      {reservationData}
      {body}

      {showBoleta ? (
        <div className="mt-5 space-y-1 text-center">
          <Pdf417Stamp ted={boleta!.ted} />
          <p className="text-[10.5px] font-bold uppercase">Timbre electrónico S.I.I. (simulado)</p>
          <p className="text-[10px] uppercase text-stone-600">
            Documento de demostración para proyecto de título. No es {isFactura ? 'una factura válida' : 'una boleta válida'} ante el SII.
          </p>
          <p className="text-[10px] text-stone-600">Emitida {fmtDateTime(boleta!.issuedAt)}</p>
        </div>
      ) : (
        <p className="mt-5 text-center text-[10.5px] uppercase text-stone-600">
          {isTenant ? 'Comprobante de pago.' : 'Liquidación del arriendo.'} No es una boleta ni una factura.
        </p>
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
  const [kind, setKind] = useState<Kind>('summary');
  const [ivaWithheld, setIvaWithheld] = useState(0);
  const [giro, setGiro] = useState<string | null>(null);
  const myDoc = documents.find((d) => (d.docType === 39 || d.docType === 33) && d.concept === (variant === 'tenant' ? 'cargo_servicio' : 'comision_propietario'));
  const hasBoleta = Boolean(myDoc);
  useEffect(() => {
    let alive = true;
    getTaxDocuments(reservation.id).then((d) => alive && setDocuments(d));
    if (variant === 'owner')
      getMyPayouts().then((ps) => alive && setIvaWithheld(ps.find((p) => p.reservationId === reservation.id)?.ivaWithheldClp || 0));
    if (variant === 'owner' && reservation.ownerId)
      getTaxStatus(reservation.ownerId)
        .then((t) => alive && setGiro(t?.activityName ? `${t.activityCode ? `${t.activityCode} · ` : ''}${t.activityName}` : null))
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [reservation.id, variant]);

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
        {hasBoleta && (
          <div role="tablist" aria-label="Documento" className="receipt-actions grid grid-cols-2 gap-1 rounded-xl bg-white/10 p-1">
            {([
              ['summary', variant === 'tenant' ? 'Comprobante de pago' : 'Liquidación'],
              ['boleta', myDoc?.docType === 33 ? 'Factura Spotly' : 'Boleta Spotly'],
            ] as const).map(([k, text]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition cursor-pointer ${
                  kind === k ? 'bg-white text-slate-900' : 'text-white hover:bg-white/10'
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        )}
        <ReceiptPaper
          reservation={reservation}
          payment={payment}
          furnished={furnished}
          avaluoFiscalClp={variant === 'owner' ? space?.avaluoFiscalClp : undefined}
          variant={variant}
          kind={hasBoleta ? kind : 'summary'}
          documents={documents}
          ivaWithheldClp={ivaWithheld}
          recipientGiro={giro}
        />
      </div>
    </div>,
    document.body,
  );
};
