// Descarga del contrato digital en PDF (RF-25).
import { DigitalContract } from '../types.ts';
import { formatClp, formatRut } from './formatters.ts';
import { isSha256Hex } from './contractHash.ts';

export async function downloadContractPdf(contract: DigitalContract): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const width = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 20) {
      doc.addPage();
      y = margin;
    }
  };

  const write = (text: string, size = 10, style: 'normal' | 'bold' = 'normal', gap = 1.5) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, width) as string[];
    const lineHeight = size * 0.42;
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += gap;
  };

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Contrato de Arrendamiento Temporal de Espacio', margin, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Folio ${contract.id} · Reserva ${contract.reservationId}`, margin, 22);
  doc.setTextColor(15, 23, 42);
  y = 40;

  write(`Espacio: ${contract.spaceTitle}`, 10, 'bold', 0.5);
  write(`Ubicación: ${contract.spaceAddress}`, 9, 'normal', 0.5);
  write(`Arrendatario: ${contract.tenantName} (RUT ${formatRut(contract.tenantRut)})`, 9, 'normal', 0.5);
  write(`Propietario: ${contract.ownerName} (RUT ${formatRut(contract.ownerRut)})`, 9, 'normal', 0.5);
  write(`Vigencia: ${contract.startDate} al ${contract.endDate}`, 9, 'normal', 0.5);
  write(
    `Monto total: ${formatClp(contract.totalClp)} · Garantía: ${formatClp(contract.guaranteeDepositClp)}`,
    9,
    'normal',
    4
  );

  contract.clauses.forEach((clause) => write(clause, 9.5, 'normal', 3));

  ensureSpace(50);
  y += 2;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;
  write('Firma electrónica simple del arrendatario (Ley N° 19.799)', 9, 'bold', 2);
  if (contract.signatureImage && contract.signatureImage.startsWith('data:image')) {
    try {
      ensureSpace(24);
      doc.addImage(contract.signatureImage, 'PNG', margin, y, 60, 20);
      y += 23;
    } catch {
      // Firma no embebible: se mantiene el registro textual.
    }
  }
  write(`${contract.tenantName} · RUT ${formatRut(contract.tenantRut)}`, 9, 'normal', 0.5);
  write(`Fecha de suscripción: ${new Date(contract.signedAt).toLocaleString('es-CL')}`, 8.5, 'normal', 0.5);
  write(`IP de suscripción: ${contract.signerIp || contract.tenantSignature.ip}`, 8.5, 'normal', 3);

  ensureSpace(22);
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, width, 20, 'F');
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(isSha256Hex(contract.contractHash) ? 'Sello de integridad SHA-256' : 'Sello (formato anterior, no verificable)', margin + 3, y);
  y += 5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.text(contract.contractHash, margin + 3, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Verifica la integridad de este documento en Spotly → Verificar contrato.', margin + 3, y);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Spotly · Contrato ${contract.id} · Página ${i} de ${pages}`, margin, pageHeight - 8);
  }

  doc.save(`Contrato_${contract.id}_Spotly.pdf`);
}
