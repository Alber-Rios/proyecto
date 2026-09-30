export type UserRole = 'tenant' | 'owner' | 'admin';

export type UserGender = 'masculino' | 'femenino' | 'no_binario' | 'otro' | 'prefiero_no_decir';

export type SpaceEnvironment = 'abierto' | 'cerrado';

export type VerificationStatus = 'unverified' | 'in_progress' | 'pending_review' | 'verified' | 'rejected';

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'rejected' | 'completed';

export type SpaceCategory = 'office' | 'cowork' | 'event' | 'studio' | 'warehouse' | 'retail';

export type DisputeStatus = 'none' | 'opened' | 'in_review' | 'resolved';

export interface AuditMetadata {
  ip: string;
  userAgent: string;
  timestamp: string;
  termsVersion: string;
  hash: string;
  legalNoticeAccepted: boolean;
}

export interface KycData {
  consentGiven: boolean;
  termsVersion: string;
  auditTrail?: AuditMetadata;
  photoCaptured: boolean;
  photoUrl?: string;
  biometricScore?: number;
  isLivenessConfirmed?: boolean;
  isDuplicateSuspect?: boolean;
  regulatoryExceptionNotice?: boolean;
  idFrontCaptured: boolean;
  idBackCaptured: boolean;
  idFrontUrl?: string;
  idBackUrl?: string;
  rutNumber: string;
  documentSerialNumber: string;
  criminalRecordSubmitted: boolean;
  criminalRecordDocCode?: string;
  criminalRecordUrl?: string;
  criminalRecordValid?: boolean;
  manualReviewRequired?: boolean;
  manualReviewNotes?: string;
  submittedAt?: string;
  rejectionReason?: string;
  rejectedAt?: string;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  rut: string;
  phone: string;
  avatarUrl?: string;
  gender?: UserGender;
  birthDate?: string;
  role: UserRole;
  ownerTermsAccepted: boolean;
  ownerApplicationDate?: string;
  verificationStatus: VerificationStatus;
  kycRejectionReason?: string;
  kycData?: KycData;
  createdAt: string;
  commune?: string;
  city?: string;
}

export type PriceUnit = 'hour' | 'day' | 'month';
export type RentalModality = 'por_hora' | 'por_dia' | 'mensual';

export interface Space {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerRut: string;
  ownerVerified: boolean;
  title: string;
  description: string;
  category: SpaceCategory;
  spaceEnvironment: SpaceEnvironment; // 'abierto' | 'cerrado'
  rentalModality?: 'por_hora' | 'por_dia' | 'mensual' | 'abierto';
  enabledModalities?: RentalModality[];
  priceUnit?: PriceUnit; // 'hour' | 'day' | 'month'
  commune: string;
  region: string;
  address: string;
  pricePerDay: number;
  pricePerHour?: number;
  pricePerMonth?: number;
  capacity: number;
  surfaceM2: number;
  amenities: string[];
  rules?: string[];
  openingHours?: string;
  securityDeposit?: number;
  images: string[];
  isVerified: boolean;
  status: 'active' | 'pending_approval' | 'paused';
  rating: number;
  reviewsCount: number;
  minBookingDays?: number;
  minBookingHours?: number;
  instantBooking?: boolean;
  createdAt: string;
}

export interface PaymentSimulationData {
  cardBrand: 'visa' | 'mastercard' | 'redcompra';
  last4: string;
  cardHolder: string;
  installments: number;
  transactionCode: string;
  authorizationCode: string;
  paidAt: string;
  status: 'approved' | 'pending';
  bankName?: string;
}

export interface SavedCard {
  id: string;
  userId: string;
  cardBrand: 'visa' | 'mastercard' | 'redcompra';
  cardHolder: string;
  last4: string;
  expiryMonth: string;
  expiryYear: string;
  bankName: string;
  isDefault: boolean;
  createdAt: string;
}

export interface VisitRequest {
  id: string;
  spaceId: string;
  spaceTitle: string;
  spaceAddress: string;
  spaceImage: string;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  ownerId: string;
  ownerName: string;
  ownerRut?: string;
  visitDate: string;
  visitTimeSlot: string;
  modality: 'presencial' | 'virtual';
  attendeesCount: number;
  notes?: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface Reservation {
  id: string;
  spaceId: string;
  spaceTitle: string;
  spaceAddress: string;
  spaceImage: string;
  spaceCategory: SpaceCategory;
  spaceEnvironment?: SpaceEnvironment;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  tenantRut: string;
  ownerId: string;
  ownerName: string;
  ownerRut?: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  dailyRateClp: number;
  priceUnit?: PriceUnit;
  durationUnits?: number;
  rentalModality?: 'por_hora' | 'por_dia' | 'mensual' | 'abierto';
  hourStart?: number;
  hourEnd?: number;
  timeSlotString?: string;
  rentalMonth?: string;
  subtotalClp: number;
  platformFeeClp: number;
  securityDepositClp: number;
  totalClp: number;
  intendedUse: string; // Caja obligatoria donde el arrendatario expresa el uso
  paymentSimulation?: PaymentSimulationData; // Simulación de pago con tarjeta
  status: ReservationStatus;
  digitalContractId?: string;
  createdAt: string;
  disputeStatus?: DisputeStatus;
  disputeReason?: string;
}

export interface DigitalContract {
  id: string;
  reservationId: string;
  spaceTitle: string;
  spaceAddress: string;
  tenantName: string;
  tenantRut: string;
  ownerName: string;
  ownerRut: string;
  totalClp: number;
  guaranteeDepositClp: number;
  startDate: string;
  endDate: string;
  clauses: string[];
  signedAt: string;
  contractHash: string;
  priceUnit?: PriceUnit;
  rentalModality?: 'por_hora' | 'por_dia' | 'mensual' | 'abierto';
  signatureImage?: string;
  signatureType?: 'digital_canvas' | 'token_fea';
  tenantSignature: {
    rut: string;
    fullName: string;
    signedAt: string;
    ip: string;
    verificationToken: string;
  };
}

export interface AuditLog {
  id: string;
  action: string;
  userId: string;
  userEmail: string;
  userRole: UserRole;
  ip: string;
  userAgent: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'security' | 'critical';
  details: Record<string, unknown>;
}

export interface Dispute {
  id: string;
  reservationId: string;
  spaceId?: string;
  spaceTitle: string;
  tenantId?: string;
  tenantName: string;
  tenantRut: string;
  ownerName: string;
  ownerRut: string;
  amountClp: number;
  subtotalClp?: number;
  securityDepositClp?: number;
  platformFeeClp?: number;
  problemCategory?: string;
  reason: string;
  status: 'pending' | 'investigating' | 'resolved_refund' | 'resolved_owner';
  createdAt: string;
  resolutionNotes?: string;
  resolvedAt?: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  read: boolean;
  link?: string;
}
