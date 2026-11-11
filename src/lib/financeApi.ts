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
  ownerCommissionRateMonthly: 0.05,
  launchEndsOn: '2027-05-31',
  ownerFreeBookings: 3,
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
    p_owner_commission_rate_monthly: s.ownerCommissionRateMonthly,
    p_launch_ends_on: s.launchEndsOn,
    p_owner_free_bookings: s.ownerFreeBookings,
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
}

export async function getMyPayouts(): Promise<OwnerPayout[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('owner_payouts')
    .select('id, reservation_id, gross_clp, owner_commission_clp, amount_clp, status, transfer_reference, paid_at, created_at')
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
  }));
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
