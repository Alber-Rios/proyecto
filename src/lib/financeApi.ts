// Comisiones, ganancias, liquidaciones y auditoría (funciones de la base).
// Los cálculos de dinero se hacen en Postgres (admin_finance_report) para que
// el panel muestre exactamente lo que está registrado.
import { isSupabaseConfigured, supabase } from './supabase.ts';

export interface PlatformSettings {
  ownerCommissionRate: number;
  ownerCommissionRateMonthly: number;
  launchEndsOn: string;
  ownerFreeBookings: number;
  updatedAt?: string;
}

/** Valores por defecto si la base aún no tiene el parche (mismos del SQL). */
export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  ownerCommissionRate: 0.1,
  ownerCommissionRateMonthly: 0.1,
  launchEndsOn: '2000-01-01',
  ownerFreeBookings: 0,
};

const mapSettings = (row: any): PlatformSettings => ({
  ownerCommissionRate: Number(row.owner_commission_rate),
  ownerCommissionRateMonthly: Number(row.owner_commission_rate_monthly),
  launchEndsOn: String(row.launch_ends_on),
  ownerFreeBookings: Number(row.owner_free_bookings),
  updatedAt: row.updated_at || undefined,
});

export async function getPlatformSettings(): Promise<PlatformSettings> {
  if (!isSupabaseConfigured()) return DEFAULT_PLATFORM_SETTINGS;
  const { data, error } = await supabase.from('platform_settings').select('*').maybeSingle();
  if (error || !data) return DEFAULT_PLATFORM_SETTINGS;
  return mapSettings(data);
}

export async function updatePlatformSettings(s: PlatformSettings): Promise<void> {
  const { error } = await supabase.rpc('admin_update_platform_settings', {
    p_owner_commission_rate: s.ownerCommissionRate,
    p_owner_commission_rate_monthly: s.ownerCommissionRate,
    p_launch_ends_on: '2000-01-01', // etapa sin comisión eliminada
    p_owner_free_bookings: 0,
  });
  if (error) throw new Error(error.message);
}

// ---------- Reporte financiero (admin) ----------

export interface FinanceTotals {
  reservations: number;
  collectedClp: number;
  refundedClp: number;
  refundPendingClp: number;
  tenantFeesClp: number;
  ownerCommissionsClp: number;
  discountsClp: number;
  cancellationFeesClp: number;
  platformRevenueClp: number;
  pendingRevenueClp: number;
  ownerNetClp: number;
  gmvClp: number;
  depositsHeldClp: number;
  cancelledCount: number;
  completedCount: number;
}

export interface FinanceMonth {
  month: string; // YYYY-MM
  tenantFeesClp: number;
  ownerCommissionsClp: number;
  discountsClp: number;
  cancellationFeesClp: number;
  platformRevenueClp: number;
  collectedClp: number;
  reservations: number;
}

export interface LedgerRow {
  reservation_id: string;
  paid_at: string;
  space_id: string;
  space_title: string;
  tenant_name: string;
  owner_id: string;
  owner_name: string;
  status: string;
  payment_status: string;
  collected_clp: number;
  subtotal_clp: number;
  deposit_clp: number;
  tenant_fee_clp: number;
  owner_commission_rate: number;
  owner_commission_reason: string | null;
  owner_commission_clp: number;
  discount_clp: number;
  cancellation_fee_clp: number;
  platform_revenue_clp: number;
  owner_net_clp: number;
  refunded_clp: number;
  refund_pending_clp: number;
  payout_status: string | null;
}

export interface PayoutItem {
  id: string;
  reservationId: string;
  ownerId: string;
  ownerName: string | null;
  grossClp: number;
  ownerCommissionClp: number;
  amountClp: number;
  status: 'pending' | 'paid' | 'on_hold' | 'cancelled';
  transferReference: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface FinanceReport {
  from: string;
  to: string;
  totals: FinanceTotals;
  monthly: FinanceMonth[];
  topSpaces: { spaceId: string; spaceTitle: string; ownerName: string; reservations: number; platformRevenueClp: number; ownerNetClp: number }[];
  rows: LedgerRow[];
  payouts: { pendingCount: number; pendingClp: number; paidClp: number; items: PayoutItem[] };
  settings: any;
  generatedAt: string;
}

const num = (v: unknown) => Number(v || 0);

export async function getFinanceReport(from: string, to: string): Promise<FinanceReport> {
  const { data, error } = await supabase.rpc('admin_finance_report', { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  const d = data as any;
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('El reporte no respondió con el formato esperado.');
  const totals = Object.fromEntries(Object.entries(d.totals || {}).map(([k, v]) => [k, num(v)])) as unknown as FinanceTotals;
  return {
    ...d,
    totals,
    monthly: (d.monthly || []).map((m: any) => ({
      ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, k === 'month' ? v : num(v)])),
    })),
    rows: (d.rows || []).map((r: any) => {
      const out: any = { ...r };
      for (const k of Object.keys(out)) if (k.endsWith('_clp') || k === 'owner_commission_rate') out[k] = num(out[k]);
      return out as LedgerRow;
    }),
    payouts: {
      pendingCount: num(d.payouts?.pendingCount),
      pendingClp: num(d.payouts?.pendingClp),
      paidClp: num(d.payouts?.paidClp),
      items: (d.payouts?.items || []).map((p: any) => ({
        ...p,
        grossClp: num(p.grossClp),
        ownerCommissionClp: num(p.ownerCommissionClp),
        amountClp: num(p.amountClp),
      })),
    },
  };
}

export async function markPayoutPaid(payoutId: string, reference: string): Promise<void> {
  const { error } = await supabase.rpc('admin_mark_payout_paid', { p_payout_id: payoutId, p_reference: reference });
  if (error) throw new Error(error.message);
}

// ---------- Liquidaciones del anfitrión ----------

export interface OwnerPayout {
  id: string;
  reservationId: string;
  grossClp: number;
  ownerCommissionClp: number;
  amountClp: number;
  status: PayoutItem['status'];
  transferReference: string | null;
  paidAt: string | null;
  createdAt: string;
  /** Martes en que se deposita. */
  scheduledFor: string | null;
}

export async function getMyPayouts(): Promise<OwnerPayout[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('owner_payouts')
    .select('id, reservation_id, gross_clp, owner_commission_clp, amount_clp, status, transfer_reference, paid_at, created_at, scheduled_for')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return [];
  return (data || []).map((p: any) => ({
    id: p.id,
    reservationId: p.reservation_id,
    grossClp: num(p.gross_clp),
    ownerCommissionClp: num(p.owner_commission_clp),
    amountClp: num(p.amount_clp),
    status: p.status,
    transferReference: p.transfer_reference,
    paidAt: p.paid_at,
    createdAt: p.created_at,
    scheduledFor: p.scheduled_for ?? null,
  }));
}

// ---------- Cuenta bancaria (propietario: depósitos · arrendatario: devoluciones) ----------

export type BankAccountType = 'corriente' | 'vista' | 'ahorro' | 'cuenta_rut';
export const BANK_ACCOUNT_TYPES: { id: BankAccountType; label: string }[] = [
  { id: 'cuenta_rut', label: 'CuentaRUT' },
  { id: 'vista', label: 'Cuenta vista' },
  { id: 'corriente', label: 'Cuenta corriente' },
  { id: 'ahorro', label: 'Cuenta de ahorro' },
];
export const CHILE_BANKS = [
  'BancoEstado', 'Banco de Chile / Edwards', 'Santander', 'BCI / MACH', 'Scotiabank', 'Itaú', 'Banco Security',
  'Banco BICE', 'Banco Falabella', 'Banco Ripley', 'Banco Consorcio', 'Banco Internacional', 'HSBC',
  'Coopeuch', 'Tenpo', 'Mercado Pago', 'Prepago Los Héroes', 'Otro',
];

export interface BankAccount {
  holderName: string;
  holderRut: string;
  bank: string;
  accountType: BankAccountType;
  accountNumber: string;
  email: string | null;
  updatedAt?: string;
}

const bankFromRow = (b: any): BankAccount => ({
  holderName: b.holder_name ?? b.holderName,
  holderRut: b.holder_rut ?? b.holderRut,
  bank: b.bank,
  accountType: b.account_type ?? b.accountType,
  accountNumber: b.account_number ?? b.accountNumber,
  email: b.email ?? null,
  updatedAt: b.updated_at,
});

export async function getMyBankAccount(userId: string): Promise<BankAccount | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase.from('bank_accounts').select('*').eq('user_id', userId).maybeSingle();
  if (error || !data) return null;
  return bankFromRow(data);
}

export async function saveMyBankAccount(userId: string, b: BankAccount): Promise<BankAccount> {
  const row = {
    user_id: userId,
    holder_name: b.holderName,
    holder_rut: b.holderRut,
    bank: b.bank,
    account_type: b.accountType,
    account_number: b.accountNumber,
    email: b.email || null,
  };
  const { data, error } = await supabase.from('bank_accounts').upsert(row, { onConflict: 'user_id' }).select('*').single();
  if (error) {
    if (/bank_accounts/i.test(error.message) && /does not exist|schema cache/i.test(error.message))
      throw new Error('Tu base de Supabase todavía no tiene la tabla de cuentas bancarias. Copia el supabase/reset-and-setup.sql más reciente del repositorio y ejecútalo en el SQL Editor.');
    if (/row-level security|permission denied/i.test(error.message)) throw new Error('No tienes permiso para guardar esta cuenta. Cierra sesión, vuelve a entrar e inténtalo de nuevo.');
    throw new Error(error.message);
  }
  return bankFromRow(data);
}

export async function deleteMyBankAccount(userId: string): Promise<void> {
  const { error } = await supabase.from('bank_accounts').delete().eq('user_id', userId);
  if (error) throw new Error(error.message);
}

/** Muestra solo los 4 últimos dígitos. */
export const maskAccount = (n: string) => (n.length <= 4 ? n : `•••• ${n.slice(-4)}`);
export const accountTypeLabel = (t: string) => BANK_ACCOUNT_TYPES.find((x) => x.id === t)?.label || t;

// ---------- Devoluciones por transferencia ----------

export type RefundTransferStatus = 'awaiting_data' | 'pending' | 'paid' | 'cancelled';

export interface RefundTransfer {
  id: string;
  reservationId: string;
  amountClp: number;
  reason: string | null;
  status: RefundTransferStatus;
  transferReference: string | null;
  paidAt: string | null;
  createdAt: string;
}

export async function getMyRefundTransfers(): Promise<RefundTransfer[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('refund_transfers')
    .select('id, reservation_id, amount_clp, reason, status, transfer_reference, paid_at, created_at')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map((t: any) => ({
    id: t.id,
    reservationId: t.reservation_id,
    amountClp: num(t.amount_clp),
    reason: t.reason,
    status: t.status,
    transferReference: t.transfer_reference,
    paidAt: t.paid_at,
    createdAt: t.created_at,
  }));
}

export interface AdminRefundTransfer extends RefundTransfer {
  tenantName: string;
  tenantEmail: string;
  spaceTitle: string | null;
  bank: BankAccount | null;
}
export interface RefundCandidate {
  reservationId: string;
  tenantName: string;
  spaceTitle: string | null;
  amountClp: number;
  cancelledAt: string | null;
}

export async function getRefundTransfers(): Promise<{ items: AdminRefundTransfer[]; candidates: RefundCandidate[] }> {
  const { data, error } = await supabase.rpc('admin_refund_transfers');
  if (error) throw new Error(error.message);
  const d = (data || {}) as any;
  return {
    items: (d.items || []).map((t: any) => ({
      id: t.id,
      reservationId: t.reservationId,
      amountClp: num(t.amountClp),
      reason: t.reason,
      status: t.status,
      transferReference: t.transferReference,
      paidAt: t.paidAt,
      createdAt: t.createdAt,
      tenantName: t.tenantName,
      tenantEmail: t.tenantEmail,
      spaceTitle: t.spaceTitle,
      bank: t.bank ? bankFromRow(t.bank) : null,
    })),
    candidates: (d.candidates || []).map((c: any) => ({ ...c, amountClp: num(c.amountClp) })),
  };
}

export async function requestRefundTransfer(reservationId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('request_refund_transfer', { p_reservation_id: reservationId, p_reason: reason });
  if (error) throw new Error(error.message);
}

export async function markRefundTransferPaid(id: string, reference: string): Promise<void> {
  const { error } = await supabase.rpc('admin_mark_refund_transfer_paid', { p_id: id, p_reference: reference });
  if (error) throw new Error(error.message);
}

// ---------- Depósitos de los martes (admin) ----------

export interface WeekOwner {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  totalClp: number;
  count: number;
  overdue: boolean;
  bank: BankAccount | null;
  items: { id: string; reservationId: string; spaceTitle: string | null; grossClp: number; ownerCommissionClp: number; amountClp: number; scheduledFor: string }[];
}
export interface PayoutWeek {
  week: string;
  cutoff: string;
  owners: WeekOwner[];
  onHold: { id: string; reservationId: string; ownerName: string; amountClp: number }[];
  upcomingClp: number;
  history: { week: string | null; ownerName: string; totalClp: number; count: number; reference: string | null; paidAt: string }[];
}

export async function getPayoutWeek(week?: string): Promise<PayoutWeek> {
  const { data, error } = await supabase.rpc('admin_payout_week', { p_week: week || null });
  if (error) throw new Error(error.message);
  const d = (data || {}) as any;
  return {
    week: d.week,
    cutoff: d.cutoff,
    owners: (d.owners || []).map((o: any) => ({
      ...o,
      totalClp: num(o.totalClp),
      bank: o.bank ? bankFromRow(o.bank) : null,
      items: (o.items || []).map((i: any) => ({ ...i, grossClp: num(i.grossClp), ownerCommissionClp: num(i.ownerCommissionClp), amountClp: num(i.amountClp) })),
    })),
    onHold: (d.onHold || []).map((h: any) => ({ ...h, amountClp: num(h.amountClp) })),
    upcomingClp: num(d.upcomingClp),
    history: (d.history || []).map((h: any) => ({ ...h, totalClp: num(h.totalClp) })),
  };
}

export async function payOwnerWeek(ownerId: string, week: string, reference: string): Promise<{ count: number; amountClp: number }> {
  const { data, error } = await supabase.rpc('admin_pay_owner_week', { p_owner: ownerId, p_week: week, p_reference: reference });
  if (error) throw new Error(error.message);
  return { count: Number((data as any)?.count || 0), amountClp: num((data as any)?.amountClp) };
}

/** Próximo martes de depósito (hoy si es martes) en formato AAAA-MM-DD, hora de Chile. */
export function nextTuesdayIso(todayIso: string): string {
  const d = new Date(`${todayIso}T12:00:00`);
  const dow = d.getDay(); // 0 domingo … 2 martes
  const add = dow === 2 ? 0 : (9 - dow) % 7;
  d.setDate(d.getDate() + add);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- Auditoría (admin) ----------

export type AuditCategory = 'pagos' | 'reservas' | 'accesos' | 'identidad' | 'espacios' | 'reclamos' | 'administracion' | 'otros';
export type AuditSeverity = 'info' | 'warning' | 'security' | 'critical';

export interface AuditEntry {
  id: string;
  seq: number | null;
  timestamp: string;
  action: string;
  category: AuditCategory;
  severity: AuditSeverity;
  userId: string;
  userEmail: string;
  userRole: string;
  ip: string | null;
  userAgent: string | null;
  details: Record<string, any>;
  rowHash: string | null;
  prevHash: string | null;
}

export interface AuditSearchResult {
  total: number;
  rows: AuditEntry[];
  bySeverity: Partial<Record<AuditSeverity, number>>;
  byCategory: Partial<Record<AuditCategory, number>>;
  last24h: { events: number; critical: number; failedLogins: number; lockouts: number; adminActions: number; payments: number };
}

export async function searchAudit(params: {
  from?: string | null;
  to?: string | null;
  severity?: string;
  category?: string;
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditSearchResult> {
  const { data, error } = await supabase.rpc('admin_audit_search', {
    p_from: params.from || null,
    p_to: params.to || null,
    p_severity: params.severity || null,
    p_category: params.category || null,
    p_query: params.query || null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const d = data as any;
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('La auditoría no respondió con el formato esperado.');
  return {
    total: num(d.total),
    rows: d.rows || [],
    bySeverity: d.bySeverity || {},
    byCategory: d.byCategory || {},
    last24h: d.last24h || { events: 0, critical: 0, failedLogins: 0, lockouts: 0, adminActions: 0, payments: 0 },
  };
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  lastHash?: string;
  verifiedAt?: string;
  brokenSeq?: number;
  brokenId?: string;
  brokenAt?: string;
  action?: string;
}

export async function verifyAuditChain(): Promise<ChainVerification> {
  const { data, error } = await supabase.rpc('admin_verify_audit_chain');
  if (error) throw new Error(error.message);
  return data as ChainVerification;
}
