// Reporte de ingresos del propietario (RF-27, RF-28).
import type { Reservation } from '../types.ts';

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export interface RevenueRow {
  reservationId: string;
  spaceTitle: string;
  tenantName: string;
  startDate: string;
  endDate: string;
  status: string;
  paymentStatus: string;
  rent: number;
  platformFee: number;
  net: number;
}

// Solo cuentan reservas vigentes con pago aprobado (o heredadas del prototipo).
export function isRevenueReservation(r: Reservation): boolean {
  const paid = !r.paymentStatus || r.paymentStatus === 'paid' || r.paymentStatus === 'legacy_simulated';
  return (r.status === 'confirmed' || r.status === 'completed') && paid;
}

export function revenueRows(reservations: Reservation[]): RevenueRow[] {
  return reservations
    .filter(isRevenueReservation)
    .map((r) => {
      const rent = Math.max(r.subtotalClp - (r.discountClp || 0), 0);
      return {
        reservationId: r.id,
        spaceTitle: r.spaceTitle,
        tenantName: r.tenantName,
        startDate: r.startDate,
        endDate: r.endDate,
        status: r.status,
        paymentStatus: r.paymentStatus || 'legacy_simulated',
        rent,
        platformFee: r.platformFeeClp,
        net: rent - r.platformFeeClp,
      };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function monthlyRevenue(
  reservations: Reservation[],
  months: number,
  today: Date = new Date()
): { key: string; label: string; net: number; count: number }[] {
  const buckets: { key: string; label: string; net: number; count: number }[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    buckets.push({ key, label: `${MONTH_LABELS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`, net: 0, count: 0 });
  }
  for (const row of revenueRows(reservations)) {
    const bucket = buckets.find((b) => b.key === row.startDate.slice(0, 7));
    if (bucket) {
      bucket.net += row.net;
      bucket.count += 1;
    }
  }
  return buckets;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// CSV con separador ";" (compatible con Excel en configuración regional de Chile).
export function buildRevenueCsv(rows: RevenueRow[]): string {
  const header = [
    'Reserva',
    'Espacio',
    'Arrendatario',
    'Inicio',
    'Término',
    'Estado',
    'Estado de pago',
    'Arriendo (CLP)',
    'Comisión Spotly (CLP)',
    'Ingreso neto (CLP)',
  ];
  const lines = rows.map((r) =>
    [r.reservationId, r.spaceTitle, r.tenantName, r.startDate, r.endDate, r.status, r.paymentStatus, r.rent, r.platformFee, r.net]
      .map(csvCell)
      .join(';')
  );
  return [header.join(';'), ...lines].join('\r\n');
}
