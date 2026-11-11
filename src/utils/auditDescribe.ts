// Descripción en español de cada evento de la bitácora de auditoría.
import { formatClp } from './formatters.ts';

type Details = Record<string, any>;

const RES_STATUS: Record<string, string> = {
  pending: 'por aprobar',
  confirmed: 'confirmada',
  completed: 'finalizada',
  cancelled: 'cancelada',
  rejected: 'rechazada',
};
const SPACE_STATUS: Record<string, string> = {
  active: 'activo',
  pending_approval: 'en revisión',
  paused: 'pausado',
  deleted: 'eliminado',
};
const ROLE: Record<string, string> = { tenant: 'arrendatario', owner: 'anfitrión', admin: 'administrador' };
const DISPUTE: Record<string, string> = {
  pending: 'pendiente',
  investigating: 'en revisión',
  resolved_tenant: 'resuelto a favor del arrendatario',
  resolved_owner: 'resuelto a favor del anfitrión',
  resolved: 'resuelto',
  rejected: 'rechazado',
};

const clp = (v: unknown) => (v === undefined || v === null || v === '' ? '' : formatClp(Number(v)));
const label = (map: Record<string, string>, v: unknown) => map[String(v)] || String(v ?? '—');

export const CATEGORY_LABEL: Record<string, string> = {
  pagos: 'Pagos',
  reservas: 'Reservas',
  accesos: 'Accesos',
  identidad: 'Identidad',
  espacios: 'Espacios',
  reclamos: 'Reclamos',
  administracion: 'Administración',
  otros: 'Otros',
};

export const SEVERITY_LABEL: Record<string, string> = {
  info: 'Informativo',
  warning: 'Advertencia',
  security: 'Seguridad',
  critical: 'Crítico',
};

export function describeAudit(action: string, d: Details = {}): string {
  switch (action) {
    case 'USER_REGISTERED_SUPABASE':
      return 'Se creó una cuenta';
    case 'SIGNUP_CODE_SENT':
      return `Se envió el código de verificación${d.email ? ` a ${d.email}` : ''}`;
    case 'EMAIL_VERIFIED':
      return 'Verificó su correo';
    case 'USER_LOGGED_IN':
      return d.remember ? 'Inició sesión (mantener sesión)' : 'Inició sesión';
    case 'USER_LOGGED_OUT':
      return 'Cerró sesión';
    case 'LOGIN_FAILED':
      return `Inicio de sesión fallido${d.email ? ` con ${d.email}` : ''}`;
    case 'LOGIN_BLOCKED_SUSPENDED':
      return 'Una cuenta suspendida intentó ingresar';
    case 'ACCOUNT_TEMPORARILY_LOCKED':
      return `Bloqueo temporal por intentos fallidos${d.email ? ` (${d.email})` : ''}`;
    case 'PASSWORD_RESET_REQUESTED':
      return 'Pidió recuperar su contraseña';
    case 'PASSWORD_RESET_COMPLETED':
      return 'Cambió su contraseña con el enlace de recuperación';
    case 'KYC_SUBMITTED':
      return 'Envió su verificación de identidad';
    case 'KYC_APPROVED':
      return 'Se aprobó una verificación de identidad';
    case 'KYC_REJECTED':
      return `Se rechazó una verificación de identidad${d.reason ? `: ${d.reason}` : ''}`;
    case 'SPACE_PUBLISHED':
      return `Publicó el espacio «${d.title || d.spaceId}»`;
    case 'SPACE_STATUS_CHANGED':
      return `Espacio ${label(SPACE_STATUS, d.from)} → ${label(SPACE_STATUS, d.to)}`;
    case 'SPACE_PRICES_CHANGED':
      return 'Cambió los precios de un espacio';
    case 'SPACE_ARCHIVED':
      return 'Se archivó un espacio con reservas';
    case 'SPACE_DELETED':
      return `Se eliminó el espacio${d.title ? ` «${d.title}»` : ''}`;
    case 'RESERVATION_CREATED': {
      const rate = Number(d.ownerCommissionRate);
      const commission = Number.isFinite(rate) && d.ownerCommissionRate !== undefined ? ` · comisión anfitrión ${Math.round(rate * 1000) / 10} %` : '';
      return `Reserva creada por ${clp(d.totalClp)}${commission}`;
    }
    case 'RESERVATION_STATUS_CHANGED': {
      const refund = Number(d.refundAmountClp) > 0 ? ` · reembolso ${clp(d.refundAmountClp)}` : '';
      return `Reserva ${label(RES_STATUS, d.from)} → ${label(RES_STATUS, d.to)}${refund}`;
    }
    case 'CONTRACT_SIGNED':
      return 'Se firmó un contrato digital';
    case 'PAYMENT_CREATED':
      return `Se inició un pago de ${clp(d.amountClp)}`;
    case 'PAYMENT_AUTHORIZED':
      return `Pago aprobado por ${clp(d.amountClp)}${d.provider === 'oneclick_mall' ? ' (tarjeta guardada)' : ''}`;
    case 'PAYMENT_FAILED':
      return `Pago rechazado por el banco (${clp(d.amountClp)})`;
    case 'PAYMENT_ABORTED':
      return 'El arrendatario abandonó el pago';
    case 'PAYMENT_REFUNDED':
      return `Pago reembolsado completo (${clp(d.refundedClp || d.amountClp)})`;
    case 'PAYMENT_PARTIALLY_REFUNDED':
      return `Reembolso parcial de ${clp(d.refundedClp)}`;
    case 'PAYOUT_CREATED':
      return `Liquidación generada: ${clp(d.amountClp)} para el anfitrión (comisión ${clp(d.ownerCommissionClp)})`;
    case 'PAYOUT_PAID':
      return `Liquidación transferida: ${clp(d.amountClp)}${d.transferReference ? ` · ref. ${d.transferReference}` : ''}`;
    case 'PAYOUT_ON_HOLD':
      return 'Liquidación retenida';
    case 'PAYOUT_CANCELLED':
      return 'Liquidación anulada';
    case 'PAYOUT_PENDING':
      return 'Liquidación vuelve a pendiente';
    case 'DISPUTE_OPENED':
      return 'Se abrió un reclamo';
    case 'DISPUTE_STATUS_CHANGED':
      return `Reclamo ${label(DISPUTE, d.from)} → ${label(DISPUTE, d.to)}`;
    case 'REPORT_CREATED':
      return 'Se reportó un usuario o publicación';
    case 'ROLE_CHANGED':
      return `Rol ${label(ROLE, d.from)} → ${label(ROLE, d.to)}`;
    case 'ADMIN_USER_SUSPENDED':
      return 'Administración suspendió una cuenta';
    case 'ADMIN_USER_REACTIVATED':
      return 'Administración reactivó una cuenta';
    case 'ADMIN_USER_ANONYMIZED':
      return 'Administración anonimizó una cuenta';
    case 'PLATFORM_SETTINGS_CHANGED':
      return 'Se cambiaron las comisiones de la plataforma';
    case 'AUDIT_CHAIN_VERIFIED':
      return `Integridad verificada: ${d.checked ?? '—'} registros en orden`;
    case 'AUDIT_CHAIN_BROKEN':
      return `Integridad rota en el registro n.º ${d.brokenSeq ?? '—'}`;
    default:
      if (action.startsWith('REPORT_')) return `Reporte ${action.slice(7).toLowerCase().replace(/_/g, ' ')}`;
      if (action.startsWith('PAYMENT_')) return `Pago: ${action.slice(8).toLowerCase().replace(/_/g, ' ')}`;
      return action.toLowerCase().replace(/_/g, ' ');
  }
}

const DETAIL_LABEL: Record<string, string> = {
  reservationId: 'Reserva',
  spaceId: 'Espacio',
  paymentId: 'Pago',
  payoutId: 'Liquidación',
  disputeId: 'Reclamo',
  targetUserId: 'Usuario afectado',
  ownerId: 'Anfitrión',
  userId: 'Usuario',
  email: 'Correo',
  buyOrder: 'Orden de compra',
  authorizationCode: 'Código de autorización',
  responseCode: 'Código de respuesta',
  provider: 'Medio de pago',
  amountClp: 'Monto',
  totalClp: 'Total',
  subtotalClp: 'Arriendo',
  tenantFeeClp: 'Cargo arrendatario',
  ownerCommissionRate: 'Comisión anfitrión (tasa)',
  ownerCommissionClp: 'Comisión anfitrión',
  ownerCommissionReason: 'Motivo de la tasa',
  discountClp: 'Descuento',
  refundAmountClp: 'Reembolso',
  refundedClp: 'Reembolsado',
  grossClp: 'Arriendo bruto',
  paymentStatus: 'Estado del pago',
  transferReference: 'Referencia de transferencia',
  from: 'Antes',
  to: 'Después',
  reason: 'Motivo',
  period: 'Período',
  title: 'Título',
  status: 'Estado',
  method: 'Método',
  remember: 'Mantener sesión',
  failedAttempts: 'Intentos fallidos',
  ipAttempts: 'Intentos desde la IP',
  checked: 'Registros revisados',
  brokenSeq: 'Registro alterado',
};

/** Pares etiqueta/valor legibles para el detalle de un evento. */
export function auditDetailRows(d: Details = {}): { key: string; label: string; value: string }[] {
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([key, v]) => {
      let value: string;
      if (typeof v === 'object') value = JSON.stringify(v);
      else if (/Clp$/.test(key)) value = formatClp(Number(v));
      else if (key === 'ownerCommissionRate') value = `${Math.round(Number(v) * 1000) / 10} %`;
      else if (typeof v === 'boolean') value = v ? 'Sí' : 'No';
      else value = String(v);
      return { key, label: DETAIL_LABEL[key] || key, value };
    });
}

/** La entidad principal del evento, para mostrar y buscar. */
export function auditEntity(d: Details = {}): string | null {
  return d.reservationId || d.payoutId || d.paymentId || d.spaceId || d.disputeId || d.targetUserId || null;
}
