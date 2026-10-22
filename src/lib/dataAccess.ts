// Acceso a las tablas y funciones de cumplimiento del informe definidas en
// supabase/reset-and-setup.sql (Parte 2).
import { supabase, isSupabaseConfigured } from './supabase.ts';
import {
  Reservation,
  NotificationItem,
  Review,
  UserReport,
  PaymentRecord,
  DiscountCode,
  KpiSnapshot,
  SpaceBlock,
} from '../types.ts';

// 1. OCUPACIÓN PÚBLICA DE UN ESPACIO (calendario sin datos personales, RF-14)
export interface OccupancySlot {
  startDate: string;
  endDate: string;
  hourStart?: number;
  hourEnd?: number;
  rentalModality?: Reservation['rentalModality'];
  durationUnits?: number;
  totalDays: number;
  status: Reservation['status'];
}

export async function getSpaceOccupancyFromDb(spaceId: string): Promise<OccupancySlot[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase.rpc('get_space_occupancy', { p_space_id: spaceId });
  if (error) {
    console.warn('No se pudo consultar la ocupación del espacio:', error.message);
    return [];
  }
  return (data || []).map((row: any) => ({
    startDate: row.start_date,
    endDate: row.end_date,
    hourStart: row.hour_start ?? undefined,
    hourEnd: row.hour_end ?? undefined,
    rentalModality: row.rental_modality ?? undefined,
    durationUnits: row.duration_units ? Number(row.duration_units) : undefined,
    totalDays: Number(row.total_days || 1),
    status: row.status,
  }));
}

export async function recordSpaceView(spaceId: string, viewerId?: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await supabase.from('space_views').insert([{ space_id: spaceId, viewer_id: viewerId || null }]);
}

// 2. FAVORITOS (RF-13)
export async function getFavoriteIdsFromDb(userId: string): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('favorites')
    .select('space_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('No se pudieron cargar los favoritos:', error.message);
    return [];
  }
  return (data || []).map((row: any) => row.space_id);
}

export async function setFavoriteInDb(userId: string, spaceId: string, favorite: boolean): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = favorite
    ? await supabase.from('favorites').upsert([{ user_id: userId, space_id: spaceId }])
    : await supabase.from('favorites').delete().eq('user_id', userId).eq('space_id', spaceId);
  if (error) console.warn('No se pudo actualizar el favorito:', error.message);
}

export async function clearFavoritesInDb(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await supabase.from('favorites').delete().eq('user_id', userId);
}

// 3. NOTIFICACIONES (RF-34)
export function mapNotificationRow(row: any): NotificationItem {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    type: row.type,
    timestamp: row.created_at,
    read: Boolean(row.read),
    link: row.link || undefined,
  };
}

export async function getNotificationsFromDb(userId: string): Promise<NotificationItem[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.warn('No se pudieron cargar las notificaciones:', error.message);
    return [];
  }
  return (data || []).map(mapNotificationRow);
}

export async function insertNotificationToDb(
  item: Pick<NotificationItem, 'userId' | 'title' | 'message' | 'type' | 'link'>
): Promise<NotificationItem | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('notifications')
    .insert([{ user_id: item.userId, title: item.title, message: item.message, type: item.type, link: item.link }])
    .select()
    .single();
  if (error) return null;
  return mapNotificationRow(data);
}

export async function markNotificationsReadInDb(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
}

export async function deleteNotificationFromDb(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await supabase.from('notifications').delete().eq('id', id);
}

// 4. VALORACIONES (RF-29)
function mapReviewRow(row: any): Review {
  return {
    id: row.id,
    spaceId: row.space_id,
    reservationId: row.reservation_id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    rating: Number(row.rating),
    comment: row.comment || undefined,
    ownerReply: row.owner_reply || undefined,
    ownerRepliedAt: row.owner_replied_at || undefined,
    createdAt: row.created_at,
  };
}

export async function getReviewsForSpace(spaceId: string): Promise<Review[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('No se pudieron cargar las valoraciones:', error.message);
    return [];
  }
  return (data || []).map(mapReviewRow);
}

export async function getReviewsByTenant(tenantId: string): Promise<Review[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await supabase.from('reviews').select('*').eq('tenant_id', tenantId);
  return (data || []).map(mapReviewRow);
}

export async function insertReviewToDb(review: {
  spaceId: string;
  reservationId: string;
  tenantId: string;
  tenantName: string;
  rating: number;
  comment?: string;
}): Promise<Review> {
  const { data, error } = await supabase
    .from('reviews')
    .insert([
      {
        space_id: review.spaceId,
        reservation_id: review.reservationId,
        tenant_id: review.tenantId,
        tenant_name: review.tenantName,
        rating: review.rating,
        comment: review.comment || null,
      },
    ])
    .select()
    .single();
  if (error) {
    throw new Error(
      error.code === '23505'
        ? 'Ya valoraste esta reserva.'
        : error.code === '42501'
        ? 'Solo puedes valorar reservas que ya finalizaron.'
        : error.message
    );
  }
  return mapReviewRow(data);
}

// El autor edita su calificación o comentario (la base no le deja tocar la respuesta).
export async function updateReviewInDb(reviewId: string, changes: { rating: number; comment?: string }): Promise<Review> {
  const { data, error } = await supabase
    .from('reviews')
    .update({ rating: changes.rating, comment: changes.comment?.trim() || null })
    .eq('id', reviewId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapReviewRow(data);
}

export async function replyToReviewInDb(reviewId: string, reply: string): Promise<Review> {
  const { data, error } = await supabase
    .from('reviews')
    .update({ owner_reply: reply.trim() || null })
    .eq('id', reviewId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapReviewRow(data);
}

// 5. REPORTES Y SUSPENSIÓN (RF-32)
function mapReportRow(row: any): UserReport {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    reporterEmail: row.reporter_email || undefined,
    targetType: row.target_type,
    targetSpaceId: row.target_space_id || undefined,
    targetUserId: row.target_user_id || undefined,
    targetLabel: row.target_label,
    category: row.category,
    description: row.description,
    status: row.status,
    adminNotes: row.admin_notes || undefined,
    resolvedAt: row.resolved_at || undefined,
    createdAt: row.created_at,
  };
}

export async function getReportsFromDb(): Promise<UserReport[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase.from('user_reports').select('*').order('created_at', { ascending: false });
  if (error) {
    console.warn('No se pudieron cargar los reportes:', error.message);
    return [];
  }
  return (data || []).map(mapReportRow);
}

export async function insertReportToDb(report: {
  reporterId: string;
  reporterEmail: string;
  targetType: 'space' | 'user';
  targetSpaceId?: string;
  targetUserId?: string;
  targetLabel: string;
  category: string;
  description: string;
}): Promise<UserReport> {
  const { data, error } = await supabase
    .from('user_reports')
    .insert([
      {
        reporter_id: report.reporterId,
        reporter_email: report.reporterEmail,
        target_type: report.targetType,
        target_space_id: report.targetSpaceId || null,
        target_user_id: report.targetUserId || null,
        target_label: report.targetLabel,
        category: report.category,
        description: report.description,
      },
    ])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapReportRow(data);
}

export async function updateReportInDb(id: string, status: UserReport['status'], adminNotes: string): Promise<UserReport> {
  const { data, error } = await supabase
    .from('user_reports')
    .update({ status, admin_notes: adminNotes.trim() || null })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapReportRow(data);
}

export async function setUserSuspensionInDb(userId: string, suspend: boolean, reason: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_suspension', {
    p_user_id: userId,
    p_suspend: suspend,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

// 6. PAGOS — solo lectura desde el cliente (RF-17)
export async function getPaymentsFromDb(): Promise<PaymentRecord[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase.from('payments').select('*').order('created_at', { ascending: false });
  if (error) {
    console.warn('No se pudieron cargar los pagos:', error.message);
    return [];
  }
  return (data || []).map((row: any) => ({
    id: row.id,
    reservationId: row.reservation_id,
    buyOrder: row.buy_order,
    provider: row.provider || 'webpay_plus',
    amountClp: Number(row.amount_clp),
    status: row.status,
    environment: row.environment,
    responseCode: row.response_code ?? undefined,
    authorizationCode: row.authorization_code || undefined,
    cardLast4: row.card_last4 || undefined,
    paymentTypeCode: row.payment_type_code || undefined,
    installmentsNumber: row.installments_number ?? undefined,
    transactionDate: row.transaction_date || undefined,
    refundedAmountClp: Number(row.refunded_amount_clp || 0),
    createdAt: row.created_at,
  }));
}

// 7. CÓDIGOS DE DESCUENTO (RF-21)
export interface DiscountValidation {
  valid: boolean;
  code?: string;
  percentOff?: number;
  maxDiscountClp?: number | null;
  discountClp: number;
  message: string;
}

export async function validateDiscountCode(code: string, subtotalClp: number): Promise<DiscountValidation> {
  const { data, error } = await supabase.rpc('compute_discount', { p_code: code, p_subtotal: subtotalClp });
  if (error) return { valid: false, discountClp: 0, message: 'No se pudo validar el código.' };
  return {
    valid: Boolean(data?.valid),
    code: data?.code,
    percentOff: data?.percent_off,
    maxDiscountClp: data?.max_discount_clp ?? null,
    discountClp: Number(data?.discount_clp || 0),
    message: data?.message || '',
  };
}

export async function getDiscountCodesFromDb(): Promise<DiscountCode[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase.from('discount_codes').select('*').order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map((row: any) => ({
    code: row.code,
    description: row.description || undefined,
    percentOff: Number(row.percent_off),
    maxDiscountClp: row.max_discount_clp ? Number(row.max_discount_clp) : undefined,
    validFrom: row.valid_from || undefined,
    validUntil: row.valid_until || undefined,
    maxUses: row.max_uses ?? undefined,
    usedCount: Number(row.used_count || 0),
    active: Boolean(row.active),
    createdAt: row.created_at,
  }));
}

export async function upsertDiscountCodeInDb(code: Omit<DiscountCode, 'usedCount' | 'createdAt'>): Promise<void> {
  const { error } = await supabase.from('discount_codes').upsert([
    {
      code: code.code.trim().toUpperCase(),
      description: code.description || null,
      percent_off: code.percentOff,
      max_discount_clp: code.maxDiscountClp || null,
      valid_from: code.validFrom || null,
      valid_until: code.validUntil || null,
      max_uses: code.maxUses || null,
      active: code.active,
    },
  ]);
  if (error) throw new Error(error.message);
}

// 8. KPI (Capítulo XI)
export async function getKpisFromDb(days = 30): Promise<KpiSnapshot> {
  const { data, error } = await supabase.rpc('admin_kpis', { p_days: days });
  if (error) throw new Error(error.message);
  return data as KpiSnapshot;
}

// BLOQUEOS DE DISPONIBILIDAD DEL PROPIETARIO (space_blocks, RF-14)
// RLS: el propietario ve y gestiona solo los suyos; administración ve todos.
// La base rechaza bloqueos que choquen con reservas activas.
const mapSpaceBlockRow = (row: any): SpaceBlock => ({
  id: row.id,
  spaceId: row.space_id,
  ownerId: row.owner_id,
  startDate: row.start_date,
  endDate: row.end_date,
  hourStart: row.hour_start ?? undefined,
  hourEnd: row.hour_end ?? undefined,
  reason: row.reason || '',
  createdAt: row.created_at,
});

export async function getSpaceBlocksFromDb(): Promise<SpaceBlock[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('space_blocks')
    .select('id, space_id, owner_id, start_date, end_date, hour_start, hour_end, reason, created_at')
    .order('start_date', { ascending: true });
  if (error) {
    console.warn('No se pudieron cargar los bloqueos:', error.message);
    return [];
  }
  return (data || []).map(mapSpaceBlockRow);
}

export async function insertSpaceBlockToDb(
  block: Omit<SpaceBlock, 'id' | 'ownerId' | 'createdAt'>
): Promise<{ success: boolean; data?: SpaceBlock; error?: string }> {
  if (!isSupabaseConfigured()) return { success: true };
  const { data, error } = await supabase
    .from('space_blocks')
    .insert([
      {
        space_id: block.spaceId,
        start_date: block.startDate,
        end_date: block.endDate,
        hour_start: block.hourStart ?? null,
        hour_end: block.hourEnd ?? null,
        reason: block.reason || null,
      },
    ])
    .select('id, space_id, owner_id, start_date, end_date, hour_start, hour_end, reason, created_at')
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: mapSpaceBlockRow(data) };
}

export async function deleteSpaceBlockFromDb(id: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: true };
  const { error } = await supabase.from('space_blocks').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
