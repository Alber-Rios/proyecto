import { DigitalContract, Reservation } from '../types.ts';
import { formatClp, formatRut } from './formatters.ts';
import { downloadContractPdf } from './contractPdf.ts';

function triggerHtmlFileDownload(filename: string, htmlContent: string) {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// RF-25: el contrato se descarga en PDF; si el navegador no puede generarlo,
// se entrega la versión HTML imprimible.
export function downloadContractDocument(contract: DigitalContract) {
  downloadContractPdf(contract).catch((err) => {
    console.warn('No se pudo generar el PDF, se descarga la versión HTML:', err);
    downloadContractHtml(contract);
  });
}

export function downloadContractHtml(contract: DigitalContract) {
  const clausesHtml = contract.clauses
    .map(
      (clause, idx) =>
        `<p style="margin: 0 0 14px 0; text-align: justify; line-height: 1.65; color: #1e293b; font-size: 13px;"><strong>${idx + 1}.</strong> ${clause}</p>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Contrato Arriendo ${contract.id} - Spotly Chile</title>
  <style>
    body { font-family: 'Georgia', 'Times New Roman', serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 32px 16px; }
    .sheet { max-width: 820px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15,23,42,0.08); }
    .header { background: #0f172a; color: #ffffff; padding: 28px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .badge { display: inline-block; background: rgba(16,185,129,0.2); color: #6ee7b7; border: 1px solid rgba(16,185,129,0.35); padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; margin-bottom: 10px; }
    .meta-strip { background: #f1f5f9; border-bottom: 1px solid #e2e8f0; padding: 12px 36px; font-family: monospace; font-size: 12px; color: #334155; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
    .content { padding: 36px; }
    .doc-title { text-align: center; font-weight: 700; font-size: 15px; letter-spacing: 0.04em; border-bottom: 2px solid #e2e8f0; padding-bottom: 18px; margin-bottom: 24px; color: #0f172a; }
    .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; }
    .signatures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 32px; padding-top: 24px; border-top: 2px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .sig-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 18px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 36px; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #64748b; }
    @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; border: none; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div style="max-width: 820px; margin: 0 auto 16px auto; display: flex; justify-content: flex-end; gap: 10px; font-family: sans-serif;" class="no-print">
    <button onclick="window.print()" style="background: #0f172a; color: #fff; border: none; padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer;">Imprimir / Guardar como PDF</button>
  </div>
  <div class="sheet">
    <div class="header">
      <div class="badge">CONTRATO DIGITAL VINCULANTE · LEY 19.799 & LEY 18.101 DE CHILE</div>
      <h1 style="margin: 0; font-size: 22px;">Contrato de Arrendamiento Temporal de Espacio</h1>
      <p style="margin: 6px 0 0 0; font-size: 12px; color: #94a3b8;">Folio Instrumento: ${contract.id} · Reserva Asociada: #${contract.reservationId}</p>
    </div>
    <div class="meta-strip">
      <span>HASH SHA-256: <strong>${contract.contractHash}</strong></span>
      <span>SUSCRITO: <strong>${new Date(contract.signedAt).toLocaleString('es-CL')}</strong></span>
    </div>
    <div class="content">
      <div class="doc-title">
        CONTRATO DE ARRENDAMIENTO TEMPORAL DE INMUEBLE CON FINES COMERCIALES Y PROFESIONALES
      </div>
      <div class="summary-grid">
        <div><strong>Inmueble / Espacio:</strong> ${contract.spaceTitle}</div>
        <div><strong>Ubicación:</strong> ${contract.spaceAddress}</div>
        <div><strong>Arrendatario:</strong> ${contract.tenantName} (RUT ${formatRut(contract.tenantRut)})</div>
        <div><strong>Propietario / Anfitrión:</strong> ${contract.ownerName} (RUT ${formatRut(contract.ownerRut)})</div>
        <div><strong>Periodo de Vigencia:</strong> ${contract.startDate} al ${contract.endDate}</div>
        <div><strong>Monto Total / Garantía:</strong> ${formatClp(contract.totalClp)} (Garantía: ${formatClp(contract.guaranteeDepositClp)})</div>
      </div>
      <div>${clausesHtml}</div>
      <div class="signatures">
        <div class="sig-box">
          <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 8px;">Firma Electrónica Arrendatario</div>
          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${contract.tenantName}</div>
          <div style="font-size: 12px; color: #475569; margin-top: 2px;">RUT: ${formatRut(contract.tenantRut)}</div>
          <div style="font-size: 11px; font-family: monospace; color: #059669; margin-top: 8px;">Código de verificación: ${contract.tenantSignature.verificationToken}</div>
          <div style="font-size: 10px; font-family: monospace; color: #64748b; margin-top: 4px;">IP: ${contract.signerIp || contract.tenantSignature.ip}</div>
        </div>
        <div class="sig-box">
          <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 8px;">Firma Electrónica Propietario / Anfitrión</div>
          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${contract.ownerName}</div>
          <div style="font-size: 12px; color: #475569; margin-top: 2px;">RUT: ${formatRut(contract.ownerRut)}</div>
          <div style="font-size: 11px; font-family: monospace; color: #059669; margin-top: 8px;">Suscripción Digital Validada por Spotly Chile</div>
          <div style="font-size: 10px; font-family: monospace; color: #64748b; margin-top: 4px;">Ley N° 19.799 sobre Firma Electrónica</div>
        </div>
      </div>
    </div>
    <div class="footer">
      Spotly Chile (EspaciosChile) · Instrumento digital verificable mediante huella criptográfica SHA-256.
    </div>
  </div>
</body>
</html>`;

  triggerHtmlFileDownload(`Contrato_${contract.id}_Spotly.html`, html);
}

export function downloadReservationDocument(reservation: Reservation) {
  const statusLabel =
    reservation.status === 'confirmed'
      ? 'CONFIRMADA POR EL ANFITRIÓN'
      : reservation.status === 'pending'
      ? 'PENDIENTE DE CONFIRMACIÓN'
      : reservation.status === 'completed'
      ? 'FINALIZADA'
      : 'CANCELADA / RECHAZADA';

  const durationText =
    reservation.rentalModality === 'por_hora'
      ? `${reservation.durationUnits || 1} hora(s) (${reservation.timeSlotString || `${reservation.hourStart || 9}:00 - ${reservation.hourEnd || 18}:00`})`
      : reservation.rentalModality === 'mensual'
      ? `${reservation.durationUnits || 1} mes(es)`
      : `${reservation.totalDays} ${reservation.totalDays === 1 ? 'día' : 'días'}`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Comprobante de Reserva #${reservation.id} - Spotly Chile</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 32px 16px; }
    .card { max-width: 760px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15,23,42,0.08); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 28px 32px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
    .status { display: inline-block; background: #10b981; color: #ffffff; font-size: 11px; font-weight: 800; padding: 5px 12px; border-radius: 999px; letter-spacing: 0.04em; }
    .section { padding: 24px 32px; border-bottom: 1px solid #e2e8f0; }
    .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; font-size: 13px; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px dashed #e2e8f0; }
    .total-row { display: flex; justify-content: space-between; padding: 14px 16px; background: #f1f5f9; border-radius: 10px; font-size: 16px; font-weight: 800; margin-top: 12px; }
    @media print { body { background: #fff; padding: 0; } .card { box-shadow: none; border: 1px solid #cbd5e1; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div style="max-width: 760px; margin: 0 auto 16px auto; display: flex; justify-content: flex-end; gap: 10px;" class="no-print">
    <button onclick="window.print()" style="background: #e11d48; color: #fff; border: none; padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer;">Imprimir / Guardar PDF</button>
  </div>
  <div class="card">
    <div class="header">
      <div>
        <div style="font-size: 12px; font-weight: 700; color: #fb7185; text-transform: uppercase; letter-spacing: 0.08em;">Spotly · Espacios Chile</div>
        <h1 style="margin: 6px 0 4px 0; font-size: 22px;">Comprobante Oficial de Reserva</h1>
        <div style="font-size: 12px; color: #94a3b8; font-family: monospace;">Código de Reserva: #${reservation.id} · Emitido: ${new Date(reservation.createdAt).toLocaleDateString('es-CL')}</div>
      </div>
      <div class="status">${statusLabel}</div>
    </div>

    <div class="section">
      <div class="section-title">1. Detalle del Espacio Reservado</div>
      <div class="grid">
        <div><strong>Recinto:</strong><br/>${reservation.spaceTitle}</div>
        <div><strong>Dirección Oficial:</strong><br/>${reservation.spaceAddress}</div>
        <div><strong>Fecha Inicio — Término:</strong><br/>${reservation.startDate} al ${reservation.endDate}</div>
        <div><strong>Duración / Modalidad:</strong><br/>${durationText}</div>
      </div>
      ${
        reservation.intendedUse
          ? `<div style="margin-top: 12px; font-size: 12px; color: #475569; background: #f8fafc; padding: 10px 12px; border-radius: 8px; border: 1px solid #e2e8f0;"><strong>Uso Declarado:</strong> ${reservation.intendedUse}</div>`
          : ''
      }
    </div>

    <div class="section">
      <div class="section-title">2. Identificación de las Partes</div>
      <div class="grid">
        <div>
          <strong>Arrendatario Titular:</strong><br/>
          ${reservation.tenantName}<br/>
          <span style="color: #475569; font-family: monospace;">RUT: ${formatRut(reservation.tenantRut)}</span><br/>
          <span style="color: #64748b; font-size: 12px;">${reservation.tenantEmail}</span>
        </div>
        <div>
          <strong>Propietario / Anfitrión:</strong><br/>
          ${reservation.ownerName}<br/>
          <span style="color: #475569; font-family: monospace;">RUT: ${formatRut(reservation.ownerRut || '14.258.963-7')}</span><br/>
          <span style="color: #64748b; font-size: 12px;">Contrato Asociado: ${reservation.digitalContractId || 'Generado digitalmente'}</span>
        </div>
      </div>
    </div>

    <div class="section" style="border-bottom: none;">
      <div class="section-title">3. Desglose Financiero (Pesos Chilenos - CLP)</div>
      <div class="row">
        <span>Subtotal Arriendo Espacio</span>
        <strong>${formatClp(reservation.subtotalClp)}</strong>
      </div>
      <div class="row">
        <span>Tarifa de Servicio y Gestión Spotly (5%)</span>
        <strong>${formatClp(reservation.platformFeeClp)}</strong>
      </div>
      <div class="row">
        <span>Depósito de Garantía Reembolsable en Custodia</span>
        <strong>${formatClp(reservation.securityDepositClp)}</strong>
      </div>
      <div class="total-row">
        <span>TOTAL PAGADO / COMPROMETIDO</span>
        <span style="color: #e11d48;">${formatClp(reservation.totalClp)}</span>
      </div>
      ${
        reservation.paymentSimulation
          ? `<div style="margin-top: 12px; font-size: 11px; color: #475569; font-family: monospace;">Medio de Pago: Webpay Plus (${reservation.paymentSimulation.cardBrand.toUpperCase()} **** ${reservation.paymentSimulation.last4}) · Cód. Autorización: ${reservation.paymentSimulation.authorizationCode}</div>`
          : ''
      }
    </div>
  </div>
</body>
</html>`;

  triggerHtmlFileDownload(`Reserva_${reservation.id}_Spotly.html`, html);
}
