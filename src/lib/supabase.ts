import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  UserProfile,
  Space,
  Reservation,
  DigitalContract,
  AuditLog,
  Dispute,
  VisitRequest,
  SavedCard,
} from '../types.ts';

const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = (): boolean => {
  return (
    Boolean(envUrl) &&
    Boolean(envKey) &&
    !envUrl.includes('your-project') &&
    !envKey.includes('your-anon-key') &&
    (envUrl.startsWith('http://') || envUrl.startsWith('https://'))
  );
};

// Fallback seguro para evitar excepción en tiempo de ejecución si aún no se han configurado las claves
const fallbackUrl = 'https://placeholder-spotly-supabase.supabase.co';
const fallbackKey = 'placeholder-anon-key-spotly';

export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured() ? envUrl : fallbackUrl,
  isSupabaseConfigured() ? envKey : fallbackKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

// ==============================================================================
// MAPEO Y FUNCIONES DE ACCESO A DATOS (SUPABASE DB CRUD)
// ==============================================================================

// 1. ESPACIOS / PROPIEDADES (spaces)
export async function getSpacesFromDb(): Promise<Space[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('spaces')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al consultar espacios en Supabase:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    ownerRut: row.owner_rut,
    ownerVerified: row.owner_verified,
    title: row.title,
    description: row.description || '',
    category: row.category,
    spaceEnvironment: row.space_environment,
    rentalModality: row.rental_modality,
    enabledModalities: row.enabled_modalities || ['por_dia'],
    priceUnit: row.price_unit,
    commune: row.commune,
    region: row.region,
    address: row.address,
    pricePerDay: Number(row.price_per_day),
    pricePerHour: row.price_per_hour ? Number(row.price_per_hour) : undefined,
    pricePerMonth: row.price_per_month ? Number(row.price_per_month) : undefined,
    capacity: Number(row.capacity),
    surfaceM2: Number(row.surface_m2),
    amenities: row.amenities || [],
    rules: row.rules || [],
    openingHours: row.opening_hours || '',
    securityDeposit: Number(row.security_deposit || 0),
    images: row.images || [],
    isVerified: row.is_verified,
    status: row.status,
    rating: Number(row.rating || 5),
    reviewsCount: Number(row.reviews_count || 0),
    minBookingDays: row.min_booking_days ? Number(row.min_booking_days) : 1,
    minBookingHours: row.min_booking_hours ? Number(row.min_booking_hours) : 1,
    instantBooking: row.instant_booking ?? true,
    createdAt: row.created_at,
  }));
}

export async function insertSpaceToDb(space: Space): Promise<{ success: boolean; data?: any; error?: string }> {
  if (!isSupabaseConfigured()) return { success: true };

  const dbRow: any = {
    owner_id: space.ownerId,
    owner_name: space.ownerName,
    owner_rut: space.ownerRut,
    owner_verified: space.ownerVerified,
    title: space.title,
    description: space.description,
    category: space.category,
    space_environment: space.spaceEnvironment,
    rental_modality: space.rentalModality || 'por_dia',
    enabled_modalities: space.enabledModalities || ['por_dia'],
    price_unit: space.priceUnit || 'day',
    commune: space.commune,
    region: space.region,
    address: space.address,
    price_per_day: space.pricePerDay,
    price_per_hour: space.pricePerHour,
    price_per_month: space.pricePerMonth,
    capacity: space.capacity,
    surface_m2: space.surfaceM2,
    amenities: space.amenities,
    rules: space.rules,
    opening_hours: space.openingHours,
    security_deposit: space.securityDeposit || 0,
    images: space.images,
    is_verified: space.isVerified,
    status: space.status,
    rating: space.rating,
    reviews_count: space.reviewsCount,
    min_booking_days: space.minBookingDays || 1,
    min_booking_hours: space.minBookingHours || 1,
    instant_booking: space.instantBooking ?? true,
    created_at: space.createdAt || new Date().toISOString(),
  };

  // El id se genera automáticamente en la base de datos de Supabase.
  // Solo se incluye si viene un ID persistido previamente (no temporal de frontend).
  if (space.id && !space.id.startsWith('spc-') && !space.id.startsWith('mock-')) {
    dbRow.id = space.id;
  }

  const { data, error } = await supabase.from('spaces').insert([dbRow]).select().single();
  if (error) {
    console.error('Error al insertar espacio en Supabase:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, data };
}

export async function updateSpaceInDb(id: string, updates: Partial<Space>): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: true };

  const dbRow: any = {};
  if (updates.title !== undefined) dbRow.title = updates.title;
  if (updates.description !== undefined) dbRow.description = updates.description;
  if (updates.category !== undefined) dbRow.category = updates.category;
  if (updates.spaceEnvironment !== undefined) dbRow.space_environment = updates.spaceEnvironment;
  if (updates.rentalModality !== undefined) dbRow.rental_modality = updates.rentalModality;
  if (updates.enabledModalities !== undefined) dbRow.enabled_modalities = updates.enabledModalities;
  if (updates.priceUnit !== undefined) dbRow.price_unit = updates.priceUnit;
  if (updates.commune !== undefined) dbRow.commune = updates.commune;
  if (updates.region !== undefined) dbRow.region = updates.region;
  if (updates.address !== undefined) dbRow.address = updates.address;
  if (updates.pricePerDay !== undefined) dbRow.price_per_day = updates.pricePerDay;
  if (updates.pricePerHour !== undefined) dbRow.price_per_hour = updates.pricePerHour;
  if (updates.pricePerMonth !== undefined) dbRow.price_per_month = updates.pricePerMonth;
  if (updates.capacity !== undefined) dbRow.capacity = updates.capacity;
  if (updates.surfaceM2 !== undefined) dbRow.surface_m2 = updates.surfaceM2;
  if (updates.amenities !== undefined) dbRow.amenities = updates.amenities;
  if (updates.rules !== undefined) dbRow.rules = updates.rules;
  if (updates.openingHours !== undefined) dbRow.opening_hours = updates.openingHours;
  if (updates.securityDeposit !== undefined) dbRow.security_deposit = updates.securityDeposit;
  if (updates.images !== undefined) dbRow.images = updates.images;
  if (updates.isVerified !== undefined) dbRow.is_verified = updates.isVerified;
  if (updates.status !== undefined) dbRow.status = updates.status;

  const { error } = await supabase.from('spaces').update(dbRow).eq('id', id);
  if (error) {
    console.error('Error al actualizar espacio en Supabase:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function deleteSpaceFromDb(id: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: true };
  const { error } = await supabase.from('spaces').delete().eq('id', id);
  if (error) {
    console.error('Error al eliminar espacio en Supabase:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

// 2. RESERVAS (reservations)
export async function getReservationsFromDb(): Promise<Reservation[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al consultar reservas en Supabase:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    spaceId: row.space_id,
    spaceTitle: row.space_title,
    spaceAddress: row.space_address || '',
    spaceImage: row.space_image || '',
    spaceCategory: row.space_category,
    spaceEnvironment: row.space_environment,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantEmail: row.tenant_email,
    tenantRut: row.tenant_rut,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    ownerRut: row.owner_rut,
    startDate: row.start_date,
    endDate: row.end_date,
    totalDays: Number(row.total_days),
    dailyRateClp: Number(row.daily_rate_clp),
    rentalModality: row.rental_modality,
    durationUnits: row.duration_units ? Number(row.duration_units) : undefined,
    priceUnit: row.price_unit,
    hourStart: row.hour_start,
    hourEnd: row.hour_end,
    timeSlotString: row.time_slot_string,
    rentalMonth: row.rental_month,
    subtotalClp: Number(row.subtotal_clp),
    platformFeeClp: Number(row.platform_fee_clp),
    securityDepositClp: Number(row.security_deposit_clp),
    totalClp: Number(row.total_clp),
    intendedUse: row.intended_use,
    paymentSimulation: row.payment_simulation,
    status: row.status,
    digitalContractId: row.digital_contract_id,
    disputeStatus: row.dispute_status,
    disputeReason: row.dispute_reason,
    createdAt: row.created_at,
  }));
}

export async function insertReservationToDb(reservation: Reservation): Promise<{ success: boolean; data?: any; error?: string }> {
  if (!isSupabaseConfigured()) return { success: true };

  const dbRow: any = {
    space_id: reservation.spaceId,
    space_title: reservation.spaceTitle,
    space_address: reservation.spaceAddress,
    space_image: reservation.spaceImage,
    space_category: reservation.spaceCategory,
    space_environment: reservation.spaceEnvironment,
    tenant_id: reservation.tenantId,
    tenant_name: reservation.tenantName,
    tenant_email: reservation.tenantEmail,
    tenant_rut: reservation.tenantRut,
    owner_id: reservation.ownerId,
    owner_name: reservation.ownerName,
    owner_rut: reservation.ownerRut,
    start_date: reservation.startDate,
    end_date: reservation.endDate,
    total_days: reservation.totalDays,
    daily_rate_clp: reservation.dailyRateClp,
    rental_modality: reservation.rentalModality,
    duration_units: reservation.durationUnits,
    price_unit: reservation.priceUnit,
    hour_start: reservation.hourStart,
    hour_end: reservation.hourEnd,
    time_slot_string: reservation.timeSlotString,
    rental_month: reservation.rentalMonth,
    subtotal_clp: reservation.subtotalClp,
    platform_fee_clp: reservation.platformFeeClp,
    security_deposit_clp: reservation.securityDepositClp,
    total_clp: reservation.totalClp,
    intended_use: reservation.intendedUse,
    payment_simulation: reservation.paymentSimulation,
    status: reservation.status,
    digital_contract_id: reservation.digitalContractId,
    dispute_status: reservation.disputeStatus || 'none',
    dispute_reason: reservation.disputeReason,
    created_at: reservation.createdAt || new Date().toISOString(),
  };

  // Solo incluir si no es un ID temporal de frontend
  if (reservation.id && !reservation.id.startsWith('res-') && !reservation.id.startsWith('mock-')) {
    dbRow.id = reservation.id;
  }

  const { data, error } = await supabase.from('reservations').insert([dbRow]).select().single();
  if (error) {
    console.error('Error al insertar reserva en Supabase:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, data };
}

export async function updateReservationInDb(
  id: string,
  updates: Partial<Reservation>
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: true };

  const dbRow: any = {};
  if (updates.status !== undefined) dbRow.status = updates.status;
  if (updates.disputeStatus !== undefined) dbRow.dispute_status = updates.disputeStatus;
  if (updates.disputeReason !== undefined) dbRow.dispute_reason = updates.disputeReason;
  if (updates.digitalContractId !== undefined) dbRow.digital_contract_id = updates.digitalContractId;

  const { error } = await supabase.from('reservations').update(dbRow).eq('id', id);
  if (error) {
    console.error('Error al actualizar reserva en Supabase:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

// 3. CONTRATOS DIGITALES (contracts)
export async function getContractsFromDb(): Promise<DigitalContract[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .order('signed_at', { ascending: false });

  if (error) {
    console.error('Error al consultar contratos en Supabase:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    reservationId: row.reservation_id,
    spaceTitle: row.space_title,
    spaceAddress: row.space_address,
    tenantName: row.tenant_name,
    tenantRut: row.tenant_rut,
    ownerName: row.owner_name,
    ownerRut: row.owner_rut,
    totalClp: Number(row.total_clp),
    guaranteeDepositClp: Number(row.guarantee_deposit_clp),
    startDate: row.start_date,
    endDate: row.end_date,
    clauses: row.clauses || [],
    signedAt: row.signed_at,
    contractHash: row.contract_hash,
    priceUnit: row.price_unit,
    rentalModality: row.rental_modality,
    signatureImage: row.signature_image,
    signatureType: row.signature_type,
    tenantSignature: row.tenant_signature || {
      rut: row.tenant_rut,
      fullName: row.tenant_name,
      signedAt: row.signed_at,
      ip: '127.0.0.1',
      verificationToken: `CHL-${row.id}`,
    },
  }));
}

export async function insertContractToDb(contract: DigitalContract): Promise<{ success: boolean; data?: any; error?: string }> {
  if (!isSupabaseConfigured()) return { success: true };

  const dbRow: any = {
    reservation_id: contract.reservationId,
    space_title: contract.spaceTitle,
    space_address: contract.spaceAddress,
    tenant_name: contract.tenantName,
    tenant_rut: contract.tenantRut,
    owner_name: contract.ownerName,
    owner_rut: contract.ownerRut,
    total_clp: contract.totalClp,
    guarantee_deposit_clp: contract.guaranteeDepositClp,
    start_date: contract.startDate,
    end_date: contract.endDate,
    clauses: contract.clauses,
    signed_at: contract.signedAt,
    contract_hash: contract.contractHash,
    price_unit: contract.priceUnit,
    rental_modality: contract.rentalModality,
    signature_image: contract.signatureImage,
    signature_type: contract.signatureType,
    tenant_signature: contract.tenantSignature,
    created_at: new Date().toISOString(),
  };

  if (contract.id && !contract.id.startsWith('ctr-') && !contract.id.startsWith('mock-')) {
    dbRow.id = contract.id;
  }

  const { data, error } = await supabase.from('contracts').insert([dbRow]).select().single();
  if (error) {
    console.error('Error al insertar contrato en Supabase:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, data };
}

// 4. REGISTROS DE AUDITORÍA (audit_logs)
export async function getAuditLogsFromDb(): Promise<AuditLog[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error al consultar auditoría en Supabase:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    action: row.action,
    userId: row.user_id,
    userEmail: row.user_email,
    userRole: row.user_role,
    ip: row.ip || '127.0.0.1',
    userAgent: row.user_agent || '',
    timestamp: row.timestamp,
    severity: row.severity,
    details: row.details || {},
  }));
}

export async function insertAuditLogToDb(log: AuditLog): Promise<{ success: boolean }> {
  if (!isSupabaseConfigured()) return { success: true };

  const dbRow: any = {
    action: log.action,
    user_id: log.userId,
    user_email: log.userEmail,
    user_role: log.userRole,
    ip: log.ip,
    user_agent: log.userAgent,
    timestamp: log.timestamp || new Date().toISOString(),
    severity: log.severity,
    details: log.details,
  };

  // Solo incluir id si es un UUID válido; de lo contrario Supabase usa gen_random_uuid()
  if (log.id && log.id.includes('-') && log.id.length === 36 && !log.id.startsWith('log-')) {
    dbRow.id = log.id;
  }

  const { error } = await supabase.from('audit_logs').insert([dbRow]);
  if (error) {
    console.warn('Error al registrar auditoría en Supabase:', error.message);
    return { success: false };
  }
  return { success: true };
}

// 5. DISPUTAS (disputes)
export async function getDisputesFromDb(): Promise<Dispute[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al consultar disputas en Supabase:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    reservationId: row.reservation_id,
    spaceId: row.space_id,
    spaceTitle: row.space_title,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantRut: row.tenant_rut,
    ownerName: row.owner_name,
    ownerRut: row.owner_rut,
    amountClp: Number(row.amount_clp),
    subtotalClp: row.subtotal_clp ? Number(row.subtotal_clp) : undefined,
    securityDepositClp: row.security_deposit_clp ? Number(row.security_deposit_clp) : undefined,
    platformFeeClp: row.platform_fee_clp ? Number(row.platform_fee_clp) : undefined,
    problemCategory: row.problem_category,
    reason: row.reason,
    status: row.status,
    resolutionNotes: row.resolution_notes,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  }));
}

export async function insertDisputeToDb(dispute: Dispute): Promise<{ success: boolean; data?: any; error?: string }> {
  if (!isSupabaseConfigured()) return { success: true };

  const dbRow: any = {
    reservation_id: dispute.reservationId,
    space_id: dispute.spaceId,
    space_title: dispute.spaceTitle,
    tenant_id: dispute.tenantId,
    tenant_name: dispute.tenantName,
    tenant_rut: dispute.tenantRut,
    owner_name: dispute.ownerName,
    owner_rut: dispute.ownerRut,
    amount_clp: dispute.amountClp,
    subtotal_clp: dispute.subtotalClp,
    security_deposit_clp: dispute.securityDepositClp,
    platform_fee_clp: dispute.platformFeeClp,
    problem_category: dispute.problemCategory,
    reason: dispute.reason,
    status: dispute.status,
    created_at: dispute.createdAt || new Date().toISOString(),
  };

  if (dispute.id && !dispute.id.startsWith('dsp-') && !dispute.id.startsWith('mock-')) {
    dbRow.id = dispute.id;
  }

  const { data, error } = await supabase.from('disputes').insert([dbRow]).select().single();
  if (error) {
    console.error('Error al insertar disputa en Supabase:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, data };
}

export async function updateDisputeInDb(
  id: string,
  updates: Partial<Dispute>
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: true };

  const dbRow: any = {};
  if (updates.status !== undefined) dbRow.status = updates.status;
  if (updates.resolutionNotes !== undefined) dbRow.resolution_notes = updates.resolutionNotes;
  if (updates.resolvedAt !== undefined) dbRow.resolved_at = updates.resolvedAt;

  const { error } = await supabase.from('disputes').update(dbRow).eq('id', id);
  if (error) {
    console.error('Error al actualizar disputa en Supabase:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

// 6. PERFILES DE USUARIO (profiles)
export async function getProfilesFromDb(): Promise<UserProfile[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) {
    console.error('Error al consultar perfiles en Supabase:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    rut: row.rut || '',
    phone: row.phone || '',
    avatarUrl: row.avatar_url,
    gender: row.gender,
    birthDate: row.birth_date,
    role: row.role,
    ownerTermsAccepted: row.owner_terms_accepted,
    ownerApplicationDate: row.owner_application_date,
    verificationStatus: row.verification_status,
    kycRejectionReason: row.kyc_rejection_reason,
    kycData: row.kyc_data,
    commune: row.commune,
    city: row.city,
    createdAt: row.created_at,
  }));
}

export async function updateProfileInDb(
  id: string,
  data: Partial<UserProfile>
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: true };

  const dbRow: any = {};
  if (data.fullName !== undefined) dbRow.full_name = data.fullName;
  if (data.email !== undefined) dbRow.email = data.email;
  if (data.rut !== undefined) dbRow.rut = data.rut;
  if (data.phone !== undefined) dbRow.phone = data.phone;
  if (data.avatarUrl !== undefined) dbRow.avatar_url = data.avatarUrl;
  if (data.gender !== undefined) dbRow.gender = data.gender;
  if (data.birthDate !== undefined) dbRow.birth_date = data.birthDate;
  if (data.role !== undefined) dbRow.role = data.role;
  if (data.ownerTermsAccepted !== undefined) dbRow.owner_terms_accepted = data.ownerTermsAccepted;
  if (data.ownerApplicationDate !== undefined) dbRow.owner_application_date = data.ownerApplicationDate;
  if (data.verificationStatus !== undefined) dbRow.verification_status = data.verificationStatus;
  if (data.kycRejectionReason !== undefined) dbRow.kyc_rejection_reason = data.kycRejectionReason;
  if (data.kycData !== undefined) dbRow.kyc_data = data.kycData;
  if (data.commune !== undefined) dbRow.commune = data.commune;
  if (data.city !== undefined) dbRow.city = data.city;

  const { error } = await supabase.from('profiles').update(dbRow).eq('id', id);
  if (error) {
    console.error('Error al actualizar perfil en Supabase:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

// 7. SOLICITUDES DE VISITA (visit_requests)
export async function getVisitRequestsFromDb(): Promise<VisitRequest[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('visit_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al consultar visitas en Supabase:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    spaceId: row.space_id,
    spaceTitle: row.space_title,
    spaceAddress: row.space_address || '',
    spaceImage: row.space_image || '',
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantEmail: row.tenant_email,
    tenantPhone: row.tenant_phone,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    ownerRut: row.owner_rut,
    visitDate: row.visit_date,
    visitTimeSlot: row.visit_time_slot,
    modality: row.modality,
    attendeesCount: Number(row.attendees_count || 1),
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function insertVisitRequestToDb(
  visit: VisitRequest
): Promise<{ success: boolean; data?: any; error?: string }> {
  if (!isSupabaseConfigured()) return { success: true };

  const dbRow: any = {
    space_id: visit.spaceId,
    space_title: visit.spaceTitle,
    space_address: visit.spaceAddress,
    space_image: visit.spaceImage,
    tenant_id: visit.tenantId,
    tenant_name: visit.tenantName,
    tenant_email: visit.tenantEmail,
    tenant_phone: visit.tenantPhone,
    owner_id: visit.ownerId,
    owner_name: visit.ownerName,
    owner_rut: visit.ownerRut,
    visit_date: visit.visitDate,
    visit_time_slot: visit.visitTimeSlot,
    modality: visit.modality,
    attendees_count: visit.attendeesCount,
    notes: visit.notes,
    status: visit.status,
    created_at: visit.createdAt || new Date().toISOString(),
  };

  if (visit.id && !visit.id.startsWith('vst-') && !visit.id.startsWith('mock-')) {
    dbRow.id = visit.id;
  }

  const { data, error } = await supabase.from('visit_requests').insert([dbRow]).select().single();
  if (error) {
    console.error('Error al insertar visita en Supabase:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, data };
}
