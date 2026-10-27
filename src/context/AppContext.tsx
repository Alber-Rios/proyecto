import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import {
  UserProfile,
  Space,
  Reservation,
  AuditLog,
  Dispute,
  NotificationItem,
  UserRole,
  UserGender,
  PaymentSimulationData,
  WalletCard,
  ReservationStatus,
  DigitalContract,
  VisitRequest,
  PaymentRecord,
  SpaceBlock,
} from '../types.ts';
import { saveAuditLog, getAuditLogs, buildAuditMetadata, fetchClientIp, SERVER_RECORDED_IP } from '../utils/auditLogger.ts';
import { callApi, postToTransbank } from '../utils/api.ts';
import { AuthApiError, authRequest, onSessionChange, purgeLegacyStoredSessions, refreshSession, setSession as setAuthSession, type ClientSession } from '../lib/authSession.ts';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { generateDigitalContract } from '../utils/contractGenerator.ts';
import { getTodayIso, capitalizeInitial, formatFullName } from '../utils/formatters.ts';
import { isAtLeast18 } from '../utils/ageValidation.ts';
import {
  supabase,
  isSupabaseConfigured,
  getSpacesFromDb,
  insertSpaceToDb,
  updateSpaceInDb,
  deleteSpaceFromDb,
  getReservationsFromDb,
  insertReservationToDb,
  updateReservationInDb,
  getContractsFromDb,
  insertContractToDb,
  getAuditLogsFromDb,
  getDisputesFromDb,
  insertDisputeToDb,
  updateDisputeInDb,
  getProfilesFromDb,
  updateProfileInDb,
  getVisitRequestsFromDb,
  insertVisitRequestToDb,
  getSpacePrivateDetails,
  fetchWalletCards,
} from '../lib/supabase.ts';
import {
  getFavoriteIdsFromDb,
  setFavoriteInDb,
  clearFavoritesInDb,
  getNotificationsFromDb,
  insertNotificationToDb,
  markNotificationsReadInDb,
  deleteNotificationFromDb,
  mapNotificationRow,
  getPaymentsFromDb,
  insertReportToDb,
  setUserSuspensionInDb,
  getSpaceBlocksFromDb,
  insertSpaceBlockToDb,
  deleteSpaceBlockFromDb,
} from '../lib/dataAccess.ts';
import { subscribeToChanges, createKeyedDebouncer, onVisibleAgain } from '../lib/realtime.ts';
import type { ChangeSignal, RealtimeTable } from '../lib/realtime.ts';

interface AppContextType {
  currentUser: UserProfile | null;
  /** true cuando ya se sabe si hay una sesión activa (evita mostrar "Inicia sesión" mientras carga). */
  authReady: boolean;
  allUsers: UserProfile[];
  profilesLoadError: string | null;
  spaces: Space[];
  reservations: Reservation[];
  contracts: DigitalContract[];
  auditLogs: AuditLog[];
  disputes: Dispute[];
  notifications: NotificationItem[];
  walletCards: WalletCard[];
  visitRequests: VisitRequest[];
  payments: PaymentRecord[];
  requestVisit: (data: Omit<VisitRequest, 'id' | 'createdAt' | 'status'>) => VisitRequest;
  // Billetera (tarjetas inscritas en Transbank Oneclick)
  refreshWalletCards: () => Promise<void>;
  addWalletCard: (returnTo?: string) => Promise<void>;
  removeWalletCard: (cardId: string) => Promise<void>;
  setDefaultWalletCard: (cardId: string) => Promise<void>;
  payWithWalletCard: (reservationId: string, cardId: string) => Promise<void>;
  // Role & Session actions
  switchUser: (userId: string | null) => void;
  login: (email: string, password?: string, remember?: boolean) => Promise<{ success: boolean; message?: string; code?: string }>;
  logout: () => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<{ success: boolean; message?: string }>;
  resendVerificationCode: (email: string) => Promise<{ success: boolean; message?: string }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message?: string }>;
  resetPassword: (link: { token_hash?: string; access_token?: string }, password: string) => Promise<{ success: boolean; message?: string; code?: string }>;
  register: (userData: {
    firstNames: string;
    surnames: string;
    fullName: string;
    rut: string;
    email: string;
    password?: string;
    phone: string;
    role: 'tenant' | 'owner';
    agreedTerms: boolean;
    gender?: UserGender;
    birthDate?: string;
  }) => Promise<{ success: boolean; message?: string; requiresEmailConfirmation?: boolean }>;
  updateUserProfile: (data: Partial<UserProfile>) => Promise<void>;
  updateUserRole: (newRole: UserRole) => void;
  upgradeTenantToOwner: (agreedTerms: boolean, kycVerified?: boolean) => Promise<{ success: boolean; message: string }>;
  // Tenant actions
  createBooking: (bookingData: {
    space: Space;
    startDate: string;
    endDate: string;
    totalDays: number;
    subtotalClp: number;
    platformFeeClp: number;
    securityDepositClp: number;
    totalClp: number;
    intendedUse: string;
    rentalModality?: 'por_hora' | 'por_dia' | 'mensual';
    hourStart?: number;
    hourEnd?: number;
    timeSlotString?: string;
    rentalMonth?: string;
    durationUnits?: number;
    priceUnit?: 'hour' | 'day' | 'month';
    signatureImage?: string;
    signatureType?: 'digital_canvas' | 'token_fea';
    discountCode?: string;
    discountClp?: number;
  }) => Promise<{ reservation: Reservation; contract: DigitalContract }>;
  startWebpayPayment: (reservationId: string) => Promise<void>;
  cancelReservation: (reservationId: string, reason?: string) => Promise<Reservation | undefined>;
  refreshReservations: () => Promise<void>;
  submitReport: (report: {
    targetType: 'space' | 'user';
    targetSpaceId?: string;
    targetUserId?: string;
    targetLabel: string;
    category: string;
    description: string;
  }) => Promise<void>;
  // Owner actions
  createSpace: (spaceData: Omit<Space, 'id' | 'ownerId' | 'ownerName' | 'ownerRut' | 'ownerVerified' | 'rating' | 'reviewsCount' | 'createdAt'>) => void;
  updateSpace: (id: string, spaceData: Partial<Space>) => void;
  deleteSpace: (id: string) => Promise<{ success: boolean; message: string }>;
  spaceBlocks: SpaceBlock[];
  addSpaceBlock: (block: Omit<SpaceBlock, 'id' | 'ownerId' | 'createdAt'>) => Promise<{ success: boolean; message?: string }>;
  removeSpaceBlock: (id: string) => Promise<{ success: boolean; message?: string }>;
  updateReservationStatus: (reservationId: string, status: ReservationStatus) => Promise<void>;
  // Admin actions
  adminSetUserSuspension: (userId: string, suspend: boolean, reason: string) => Promise<void>;
  adminApproveKyc: (userId: string) => void;
  adminRejectKyc: (userId: string, reason: string) => void;
  adminToggleSpaceStatus: (spaceId: string, status: 'active' | 'paused' | 'pending_approval') => void;
  adminResolveDispute: (disputeId: string, resolution: 'resolved_refund' | 'resolved_owner', notes: string) => void;
  createDispute: (
    reservationId: string,
    reason: string,
    options?: { spaceId?: string; problemCategory?: string }
  ) => Dispute | undefined;
  // Audit & Notifications
  addAuditRecord: (action: string, severity: 'info' | 'warning' | 'security' | 'critical', details: Record<string, unknown>) => void;
  dismissNotification: (id: string) => void;
  markAllNotificationsRead: () => void;
  // View states helpers
  isOwnerCapable: boolean;
  // Favorites
  favoriteSpaceIds: string[];
  toggleFavoriteSpace: (spaceId: string) => void;
  isSpaceFavorite: (spaceId: string) => boolean;
  clearFavorites: () => void;
}

// Convierte una fila de public.profiles al modelo de la aplicación.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const profileRowToUser = (profile: any): UserProfile => ({
  id: profile.id,
  fullName: formatFullName(profile.first_names, profile.surnames, profile.full_name),
  firstNames: profile.first_names ? capitalizeInitial(profile.first_names) : undefined,
  surnames: profile.surnames ? capitalizeInitial(profile.surnames) : undefined,
  email: profile.email,
  rut: profile.rut || '',
  phone: profile.phone || '',
  avatarUrl: profile.avatar_url,
  gender: profile.gender,
  birthDate: profile.birth_date,
  role: profile.role,
  ownerTermsAccepted: profile.owner_terms_accepted,
  ownerApplicationDate: profile.owner_application_date,
  verificationStatus: profile.verification_status,
  kycRejectionReason: profile.kyc_rejection_reason,
  kycData: profile.kyc_data,
  commune: profile.commune,
  city: profile.city,
  isSuspended: Boolean(profile.is_suspended),
  suspendedReason: profile.suspended_reason || undefined,
  createdAt: profile.created_at,
});

const DUPLICATE_EMAIL_MESSAGE =
  'Ya existe una cuenta registrada con este correo electrónico. Inicia sesión o recupera tu contraseña.';
const DUPLICATE_RUT_MESSAGE =
  'Ya existe una cuenta registrada con este RUT. Si es tuyo, inicia sesión o contacta a soporte.';

const AppContext = createContext<AppContextType | undefined>(undefined);


export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [profilesLoadError, setProfilesLoadError] = useState<string | null>(
    isSupabaseConfigured() ? null : 'Supabase no está configurado para esta aplicación.'
  );
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [contracts, setContracts] = useState<DigitalContract[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [walletCards, setWalletCards] = useState<WalletCard[]>([]);
  const [visitRequests, setVisitRequests] = useState<VisitRequest[]>([]);
  const [favoritesByUser, setFavoritesByUser] = useState<Record<string, string[]>>({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => getAuditLogs());
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [spaceBlocks, setSpaceBlocks] = useState<SpaceBlock[]>([]);
  const [spacePrivateDetails, setSpacePrivateDetails] = useState<Record<string, { ownerRut: string; address: string }>>({});

  // Notificaciones: se persisten en Supabase (tabla notifications) y llegan en tiempo real.
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Carga de datos propios del usuario autenticado y suscripción en tiempo real.
  useEffect(() => {
    if (!currentUser || !isSupabaseConfigured()) {
      // Al cerrar sesión no deben quedar en memoria datos de la cuenta anterior.
      setNotifications([]);
      setSpacePrivateDetails({});
      setReservations([]);
      setContracts([]);
      setDisputes([]);
      setVisitRequests([]);
      setPayments([]);
      setSpaceBlocks([]);
      return;
    }
    const userId = currentUser.id;
    let active = true;

    getNotificationsFromDb(userId).then((items) => {
      if (active) setNotifications(items);
    });
    getFavoriteIdsFromDb(userId).then((ids) => {
      if (active) setFavoritesByUser((prev) => ({ ...prev, [userId]: ids }));
    });
    getSpaceBlocksFromDb().then((items) => {
      if (active) setSpaceBlocks(items);
    });
    getPaymentsFromDb().then((items) => {
      if (active) setPayments(items);
    });
    getSpacePrivateDetails().then((details) => {
      if (active) setSpacePrivateDetails(details);
    });
    Promise.all([getReservationsFromDb(), getContractsFromDb(), getDisputesFromDb(), getVisitRequestsFromDb()]).then(
      ([dbReservations, dbContracts, dbDisputes, dbVisits]) => {
        if (!active) return;
        setReservations(dbReservations);
        setContracts(dbContracts);
        setDisputes(dbDisputes);
        setVisitRequests(dbVisits);
      }
    );

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const item = mapNotificationRow(payload.new);
          setNotifications((prev) => (prev.some((n) => n.id === item.id) ? prev : [item, ...prev]));
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id]);

  // Tiempo real con carga mínima: la base avisa qué tabla cambió (sin datos) y
  // aquí se vuelve a consultar solo esa tabla, agrupando avisos seguidos.
  // Temas: catalog (todos), user:<id> (lo propio) y admin (solo administradores).
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const userId = currentUser?.id;
    const isAdminUser = currentUser?.role === 'admin';
    let active = true;
    const debouncer = createKeyedDebouncer(400);

    const refresh = (table: RealtimeTable) =>
      debouncer.run(table, async () => {
        try {
          switch (table) {
            case 'spaces': {
              const items = await getSpacesFromDb();
              if (active) setSpaces(items);
              if (userId) {
                const details = await getSpacePrivateDetails();
                if (active) setSpacePrivateDetails(details);
              }
              break;
            }
            case 'reservations': {
              if (!userId) break;
              const items = await getReservationsFromDb();
              if (active) setReservations(items);
              break;
            }
            case 'contracts': {
              if (!userId) break;
              const items = await getContractsFromDb();
              if (active) setContracts(items);
              break;
            }
            case 'space_blocks': {
              if (!userId) break;
              const items = await getSpaceBlocksFromDb();
              if (active) setSpaceBlocks(items);
              break;
            }
            case 'payments': {
              if (!userId) break;
              const items = await getPaymentsFromDb();
              if (active) setPayments(items);
              break;
            }
            case 'disputes': {
              if (!userId) break;
              const items = await getDisputesFromDb();
              if (active) setDisputes(items);
              break;
            }
            case 'visit_requests': {
              if (!userId) break;
              const items = await getVisitRequestsFromDb();
              if (active) setVisitRequests(items);
              break;
            }
            case 'profiles': {
              if (!userId) break;
              const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
              if (active && profile) setCurrentUser(profileRowToUser(profile));
              if (isAdminUser) {
                const users = await getProfilesFromDb();
                if (active) setAllUsers(users);
              }
              break;
            }
          }
        } catch (err) {
          console.warn(`No se pudo actualizar ${table} en tiempo real:`, err);
        }
      });

    const ownTables: RealtimeTable[] = ['reservations', 'contracts', 'payments', 'disputes', 'visit_requests', 'profiles', 'space_blocks'];
    const refreshAll = () => {
      refresh('spaces');
      if (userId) ownTables.forEach(refresh);
    };
    const onSignal = (signal: ChangeSignal) => refresh(signal.table);

    const unsubscribers = [subscribeToChanges('catalog', onSignal, refreshAll), onVisibleAgain(refreshAll)];
    if (userId) unsubscribers.push(subscribeToChanges(`user:${userId}`, onSignal, refreshAll));
    if (isAdminUser) unsubscribers.push(subscribeToChanges('admin', onSignal, refreshAll));

    return () => {
      active = false;
      debouncer.cancelAll();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentUser?.id, currentUser?.role]);

  // Una cuenta suspendida no puede mantener la sesión abierta (RF-32).
  useEffect(() => {
    if (currentUser?.isSuspended) {
      void logout();
    }
  }, [currentUser?.isSuspended]);

  // Auditoría helper. La IP y la fecha definitivas las fija la base de datos.
  const addAuditRecord = (
    action: string,
    severity: 'info' | 'warning' | 'security' | 'critical',
    details: Record<string, unknown>
  ) => {
    const log = saveAuditLog({
      action,
      severity,
      userId: currentUser ? currentUser.id : 'guest-anonymous',
      userEmail: currentUser ? currentUser.email : 'visitante@spotly.cl',
      userRole: currentUser ? currentUser.role : ('tenant' as UserRole),
      ip: SERVER_RECORDED_IP,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      details,
    });
    // Solo registro local de la sesión: la bitácora persistente la escribe
    // exclusivamente el servidor (triggers y backend), nunca el cliente.
    setAuditLogs((prev) => [log, ...prev]);
  };

  // Inicialización y Carga de Datos desde Supabase al montar el componente
  useEffect(() => {
    let isMounted = true;

    async function initializeSupabaseData() {
      if (!isSupabaseConfigured()) {
        setAuthReady(true);
        return;
      }

      try {
        // 1. Recuperar la sesión desde la cookie HttpOnly (la maneja /api/auth).
        purgeLegacyStoredSessions();
        let sessionData: { session: ClientSession | null } | null = null;
        try {
          sessionData = { session: await refreshSession() };
          if (sessionData.session?.user && isMounted) {
            supabase.realtime.setAuth(sessionData.session.access_token);
            const userId = sessionData.session.user.id;
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .single();

            if (profile && isMounted) {
              const loadedUser = profileRowToUser(profile);
              setCurrentUser(loadedUser);
            }
          }
        } finally {
          if (isMounted) setAuthReady(true);
        }

        // 2. Cargar tablas desde Supabase DB
        // Sin sesión solo se leen datos públicos: el resto de las tablas no es
        // accesible para el rol anónimo.
        const hasSession = Boolean(sessionData?.session?.user);
        let profileError: string | null = null;
        const profilesPromise = hasSession
          ? getProfilesFromDb().catch((profileLoadErr) => {
              profileError = profileLoadErr instanceof Error ? profileLoadErr.message : 'No se pudieron cargar los perfiles.';
              return [];
            })
          : Promise.resolve([]);
        const [
          dbSpaces,
          dbReservations,
          dbContracts,
          dbDisputes,
          dbVisits,
          dbLogs,
          dbProfiles,
        ] = await Promise.all([
          getSpacesFromDb(),
          hasSession ? getReservationsFromDb() : Promise.resolve([]),
          hasSession ? getContractsFromDb() : Promise.resolve([]),
          hasSession ? getDisputesFromDb() : Promise.resolve([]),
          hasSession ? getVisitRequestsFromDb() : Promise.resolve([]),
          hasSession ? getAuditLogsFromDb() : Promise.resolve([]),
          profilesPromise,
        ]);

        if (isMounted) {
          setSpaces(dbSpaces);
          setReservations(dbReservations);
          setContracts(dbContracts);
          setDisputes(dbDisputes);
          setVisitRequests(dbVisits);
          setAuditLogs(dbLogs);
          setAllUsers(dbProfiles);
          setProfilesLoadError(profileError);
        }
      } catch (err) {
        console.warn('Error durante la inicialización de Supabase:', err);
        if (isMounted) {
          setProfilesLoadError(err instanceof Error ? err.message : 'No se pudieron cargar los datos de Supabase.');
        }
      }
    }

    initializeSupabaseData();

    // 3. Cambios de sesión (renovación del token, sesión vencida o revocada).
    const unsubscribeSession = onSessionChange((session) => {
      if (!isMounted) return;
      supabase.realtime.setAuth(session?.access_token ?? null);
      if (!session) setCurrentUser(null);
    });

    return () => {
      isMounted = false;
      unsubscribeSession();
    };
  }, []);

  // Inicio de sesión por Email o RUT (Supabase Auth con Fallback local)
  // Carga el perfil del usuario con sesión y lo deja como usuario actual.
  const loadSessionProfile = async (userId: string): Promise<UserProfile | null> => {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (!profile) return null;
    const user = profileRowToUser(profile);
    setCurrentUser(user);
    if (user.role === 'admin') {
      try {
        setAllUsers(await getProfilesFromDb());
        setProfilesLoadError(null);
      } catch (profileLoadErr) {
        setProfilesLoadError(profileLoadErr instanceof Error ? profileLoadErr.message : 'No se pudieron cargar los perfiles.');
      }
    }
    return user;
  };

  // Inicio de sesión: lo resuelve el servidor (/api/auth), que aplica el bloqueo por
  // intentos, exige el correo verificado y deja la sesión en una cookie HttpOnly.
  const login = async (
    email: string,
    password?: string,
    remember = true
  ): Promise<{ success: boolean; message?: string; code?: string }> => {
    if (!isSupabaseConfigured()) {
      return { success: false, message: 'La plataforma no está conectada a la base de datos.' };
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@') || !password) {
      return { success: false, message: 'Ingresa tu correo electrónico y tu contraseña.' };
    }
    try {
      const r = await authRequest<{ session: ClientSession }>('login', { email: cleanEmail, password, remember });
      setAuthSession(r.session);
      supabase.realtime.setAuth(r.session.access_token);
      const user = await loadSessionProfile(r.session.user.id);
      return { success: true, message: user ? `¡Bienvenido nuevamente, ${user.fullName.split(' ')[0]}!` : undefined };
    } catch (err) {
      if (err instanceof AuthApiError) return { success: false, message: err.message, code: err.code };
      return { success: false, message: 'No se pudo iniciar sesión. Inténtalo nuevamente.' };
    }
  };

  // Cierre de sesión: el servidor revoca el token en Supabase y borra la cookie.
  const logout = async () => {
    try {
      await authRequest('logout', {}, true);
    } catch (err) {
      console.warn('No se pudo cerrar la sesión en el servidor:', err);
    }
    setAuthSession(null);
    supabase.realtime.setAuth(null);
    setCurrentUser(null);
    setAllUsers([]);
  };

  // Registro: el servidor crea la cuenta SIN activarla y envía un código al correo.
  // La cuenta solo queda activa (y con sesión) al validar ese código en verifyEmail().
  const register = async (userData: {
    firstNames: string;
    surnames: string;
    fullName: string;
    rut: string;
    email: string;
    password?: string;
    phone: string;
    role: 'tenant' | 'owner';
    agreedTerms: boolean;
    gender?: UserGender;
    birthDate?: string;
  }): Promise<{ success: boolean; message?: string; requiresEmailConfirmation?: boolean }> => {
    if (!isAtLeast18(userData.birthDate || '')) {
      return { success: false, message: 'Debes tener 18 años o más para crear una cuenta.' };
    }
    if (!isSupabaseConfigured()) {
      return { success: false, message: 'La plataforma no está conectada a la base de datos.' };
    }
    if (!userData.password) {
      return { success: false, message: 'Debes ingresar una contraseña.' };
    }
    try {
      const r = await authRequest<{ message?: string }>('signup', {
        email: userData.email.trim().toLowerCase(),
        password: userData.password,
        firstNames: userData.firstNames,
        surnames: userData.surnames,
        rut: userData.rut,
        phone: userData.phone,
        role: userData.role,
        agreedTerms: userData.agreedTerms,
        gender: userData.gender,
        birthDate: userData.birthDate,
      });
      return { success: true, requiresEmailConfirmation: true, message: r.message };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'No fue posible completar el registro.' };
    }
  };

  // Valida el código enviado al correo; si es correcto la cuenta queda activa y con sesión.
  const verifyEmail = async (email: string, code: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const r = await authRequest<{ session: ClientSession }>('verify', { email: email.trim().toLowerCase(), code: code.trim() });
      setAuthSession(r.session);
      supabase.realtime.setAuth(r.session.access_token);
      const user = await loadSessionProfile(r.session.user.id);
      if (user) {
        addAuditRecord('USER_REGISTERED', 'security', { userId: user.id, userEmail: user.email, userRole: user.role });
      }
      return { success: true, message: '¡Correo verificado! Tu cuenta ya está activa.' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'No se pudo verificar el código.' };
    }
  };

  const resendVerificationCode = async (email: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const r = await authRequest<{ message?: string }>('resend', { email: email.trim().toLowerCase() });
      return { success: true, message: r.message };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'No se pudo reenviar el código.' };
    }
  };

  const requestPasswordReset = async (email: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const r = await authRequest<{ message?: string }>('forgot', { email: email.trim().toLowerCase() });
      return { success: true, message: r.message };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'No se pudo enviar el enlace.' };
    }
  };

  const resetPassword = async (
    link: { token_hash?: string; access_token?: string },
    password: string
  ): Promise<{ success: boolean; message?: string; code?: string }> => {
    try {
      const r = await authRequest<{ message?: string }>('reset', { ...link, password });
      // Por seguridad el servidor cierra todas las sesiones de la cuenta.
      setAuthSession(null);
      setCurrentUser(null);
      return { success: true, message: r.message };
    } catch (err) {
      if (err instanceof AuthApiError) return { success: false, message: err.message, code: err.code };
      return { success: false, message: 'No se pudo guardar la contraseña.' };
    }
  };

  // Actualizar perfil de usuario (Mi Cuenta y Supabase)
  const updateUserProfile = async (data: Partial<UserProfile>) => {
    if (!currentUser) return;

    const updatedUser: UserProfile = {
      ...currentUser,
      ...data,
    };

    // Actualizar en base de datos Supabase
    if (isSupabaseConfigured()) {
      const result = await updateProfileInDb(updatedUser.id, data);
      if (!result.success) {
        throw new Error(`No se pudo guardar el perfil en Supabase: ${result.error || 'error desconocido'}`);
      }
    }

    setCurrentUser(updatedUser);
    setAllUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));

    addAuditRecord('USER_PROFILE_UPDATED', 'info', {
      userId: updatedUser.id,
      updatedFields: Object.keys(data),
    });

    setNotifications((prev) => [
      {
        id: `notif-update-${Date.now()}`,
        userId: updatedUser.id,
        title: 'Datos actualizados',
        message: 'Tus datos personales de perfil han sido actualizados y sincronizados con éxito.',
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ]);
  };

  // Cambio de usuario para pruebas y cambio de rol
  const switchUser = (userId: string | null) => {
    if (!userId || userId === 'guest') {
      logout();
      return;
    }

    const target = allUsers.find((u) => u.id === userId);
    if (target) {
      setCurrentUser(target);
      addAuditRecord('SESSION_USER_SWITCHED', 'info', {
        newUserId: target.id,
        newRole: target.role,
        ownerTermsAccepted: target.ownerTermsAccepted,
      });
      setNotifications((prev) => [
        {
          id: `notif-${Date.now()}`,
          userId: target.id,
          title: `Sesión iniciada como ${target.role === 'admin' ? 'Administrador' : target.role === 'owner' ? 'Propietario' : 'Arrendatario'}`,
          message: `Conectado como ${target.fullName} (${target.rut})`,
          type: 'info',
          timestamp: new Date().toISOString(),
          read: false,
        },
        ...prev,
      ]);
    }
  };

  const updateUserRole = (newRole: UserRole) => {
    if (!currentUser) return;
    if (newRole === 'owner' && !currentUser.ownerTermsAccepted) {
      alert('Debes aceptar los Términos y Condiciones de Propietario para activar el perfil de anfitrión.');
      return;
    }

    const updatedUser: UserProfile = { ...currentUser, role: newRole };
    setCurrentUser(updatedUser);
    setAllUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));

    if (isSupabaseConfigured()) {
      updateProfileInDb(updatedUser.id, { role: newRole }).catch(console.warn);
    }

    addAuditRecord('ROLE_CHANGED', 'security', {
      previousRole: currentUser.role,
      newRole,
    });
  };

  // Permitir a los arrendatarios volverse propietarios aceptando términos
  const upgradeTenantToOwner = async (
    agreedTerms: boolean,
    kycVerified = true
  ): Promise<{ success: boolean; message: string }> => {
    if (!currentUser) {
      return { success: false, message: 'Debes iniciar sesión para realizar esta acción.' };
    }
    if (!agreedTerms) {
      return { success: false, message: 'Es obligatorio aceptar el contrato de adhesión de Propietarios y anfitriones Spotly.' };
    }

    const auditMeta = await buildAuditMetadata('OWNER-TERMS-v2026.1');

    const updatedUser: UserProfile = {
      ...currentUser,
      role: 'owner',
      ownerTermsAccepted: true,
      ownerApplicationDate: new Date().toISOString(),
      verificationStatus: currentUser.verificationStatus,
    };

    setCurrentUser(updatedUser);
    setAllUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));

    if (isSupabaseConfigured()) {
      updateProfileInDb(updatedUser.id, {
        role: 'owner',
        ownerTermsAccepted: true,
        ownerApplicationDate: updatedUser.ownerApplicationDate,
      }).catch(console.warn);
    }

    addAuditRecord('UPGRADED_TO_OWNER', 'security', {
      termsAccepted: true,
      termsVersion: 'OWNER-TERMS-v2026.1',
      auditHash: auditMeta.hash,
      verificationStatus: updatedUser.verificationStatus,
    });

    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        userId: updatedUser.id,
        title: '¡Felicitaciones! Ahora eres propietario en Spotly',
        message: 'Términos y condiciones de anfitrión aceptados legalmente. Ya puedes publicar y gestionar tus espacios en Chile.',
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ]);

    return {
      success: true,
      message: '¡Tu cuenta ha sido activada con éxito como Propietario! Ya puedes ingresar al Panel de Propietarios.',
    };
  };

  // Recarga reservas y pagos desde Supabase (p. ej., al volver de Webpay).
  const refreshReservations = async () => {
    if (!isSupabaseConfigured()) return;
    const [dbReservations, dbContracts, dbPayments] = await Promise.all([
      getReservationsFromDb(),
      getContractsFromDb(),
      getPaymentsFromDb(),
    ]);
    setReservations(dbReservations);
    setContracts(dbContracts);
    setPayments(dbPayments);
  };

  // Creación de reserva (RF-15/16/22/23/24). La reserva queda "pendiente de pago" y
  // bloquea el horario en la base (restricción de exclusión) hasta que Webpay
  // confirme o rechace el pago. El contrato firmado se sella con SHA-256.
  const createBooking = async (bookingData: {
    space: Space;
    startDate: string;
    endDate: string;
    totalDays: number;
    subtotalClp: number;
    platformFeeClp: number;
    securityDepositClp: number;
    totalClp: number;
    intendedUse: string;
    rentalModality?: 'por_hora' | 'por_dia' | 'mensual';
    hourStart?: number;
    hourEnd?: number;
    timeSlotString?: string;
    rentalMonth?: string;
    durationUnits?: number;
    priceUnit?: 'hour' | 'day' | 'month';
    signatureImage?: string;
    signatureType?: 'digital_canvas' | 'token_fea';
    discountCode?: string;
    discountClp?: number;
  }): Promise<{ reservation: Reservation; contract: DigitalContract }> => {
    if (!currentUser) {
      throw new Error('Debes iniciar sesión para reservar un espacio.');
    }
    if (!isSupabaseConfigured()) {
      throw new Error('La plataforma no está conectada a la base de datos. No es posible reservar.');
    }

    const todayStr = getTodayIso();
    if (bookingData.startDate < todayStr) {
      throw new Error('La fecha de la reserva debe ser desde el día actual hacia adelante.');
    }
    if (bookingData.endDate < bookingData.startDate) {
      throw new Error('La fecha de término no puede ser anterior a la fecha de inicio.');
    }

    const modality = bookingData.rentalModality || bookingData.space.rentalModality || 'por_dia';
    const priceUnit = bookingData.priceUnit || (modality === 'por_hora' ? 'hour' : modality === 'mensual' ? 'month' : 'day');

    const draft: Reservation = {
      id: `RES-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      spaceId: bookingData.space.id,
      spaceTitle: bookingData.space.title,
      spaceAddress: `${bookingData.space.address}, ${bookingData.space.commune}`,
      spaceImage: bookingData.space.images[0] || '',
      spaceCategory: bookingData.space.category,
      spaceEnvironment: bookingData.space.spaceEnvironment,
      tenantId: currentUser.id,
      tenantName: currentUser.fullName,
      tenantEmail: currentUser.email,
      tenantPhone: currentUser.phone,
      tenantRut: currentUser.rut,
      ownerId: bookingData.space.ownerId,
      ownerName: bookingData.space.ownerName,
      ownerRut: bookingData.space.ownerRut,
      startDate: bookingData.startDate,
      endDate: bookingData.endDate,
      totalDays: bookingData.totalDays,
      dailyRateClp: bookingData.space.pricePerDay,
      rentalModality: modality,
      durationUnits: bookingData.durationUnits || bookingData.totalDays,
      priceUnit,
      hourStart: bookingData.hourStart,
      hourEnd: bookingData.hourEnd,
      timeSlotString: bookingData.timeSlotString,
      rentalMonth: bookingData.rentalMonth,
      subtotalClp: bookingData.subtotalClp,
      platformFeeClp: bookingData.platformFeeClp,
      securityDepositClp: bookingData.securityDepositClp,
      totalClp: bookingData.totalClp,
      discountCode: bookingData.discountCode,
      discountClp: bookingData.discountClp || 0,
      intendedUse: bookingData.intendedUse,
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: new Date().toISOString(),
    };

    // 1. Reserva: la base valida montos, descuento y solapamiento de forma atómica.
    const inserted = await insertReservationToDb(draft);
    if (!inserted.success || !inserted.data) {
      if (inserted.code === '23P01') {
        throw new Error(
          'Conflicto de disponibilidad: otra persona acaba de reservar ese horario. Elige otra fecha u horario.'
        );
      }
      throw new Error(inserted.error || 'No se pudo registrar la reserva.');
    }
    const reservation = inserted.data;

    // 2. Contrato firmado con huella SHA-256 sobre su contenido íntegro.
    const contract = await generateDigitalContract({
      reservationId: reservation.id,
      spaceTitle: bookingData.space.title,
      spaceAddress: `${reservation.spaceAddress}, ${bookingData.space.region}`,
      tenantName: currentUser.fullName,
      tenantRut: currentUser.rut,
      ownerName: reservation.ownerName,
      ownerRut: reservation.ownerRut || '',
      totalClp: reservation.totalClp,
      guaranteeDepositClp: reservation.securityDepositClp,
      discountClp: reservation.discountClp,
      startDate: bookingData.startDate,
      endDate: bookingData.endDate,
      ip: await fetchClientIp(),
      rentalModality: modality,
      priceUnit,
      durationUnits: bookingData.durationUnits || bookingData.totalDays,
      hourStart: bookingData.hourStart,
      hourEnd: bookingData.hourEnd,
      intendedUse: bookingData.intendedUse,
      signatureImage: bookingData.signatureImage,
      signatureType: bookingData.signatureType,
    });

    const contractResult = await insertContractToDb(contract);
    if (!contractResult.success) {
      // Sin contrato no se puede pagar: se libera el horario de inmediato.
      await updateReservationInDb(reservation.id, {
        status: 'cancelled',
        cancellationReason: 'No se pudo registrar el contrato firmado',
      });
      throw new Error(`No se pudo registrar el contrato firmado: ${contractResult.error || 'error desconocido'}`);
    }
    await updateReservationInDb(reservation.id, { digitalContractId: contract.id });

    const finalReservation: Reservation = { ...reservation, digitalContractId: contract.id };
    setReservations((prev) => [finalReservation, ...prev.filter((r) => r.id !== finalReservation.id)]);
    setContracts((prev) => [contract, ...prev]);
    getSpacePrivateDetails().then(setSpacePrivateDetails).catch(() => undefined);

    return { reservation: finalReservation, contract };
  };

  // Inicia el pago en Webpay Plus: el backend crea la transacción y el navegador
  // se redirige al formulario de Transbank (RF-17).
  const startWebpayPayment = async (reservationId: string) => {
    const { url, token } = await callApi<{ url: string; token: string }>('/api/webpay?action=create', {
      reservationId,
    });
    postToTransbank(url, 'token_ws', token);
  };

  // Solicita a Transbank la reversa cuando la base dejó un reembolso pendiente.
  const processPendingRefund = async (reservation: Reservation | undefined) => {
    if (!reservation || reservation.paymentStatus !== 'refund_pending') return;
    try {
      await callApi('/api/webpay?action=refund', { reservationId: reservation.id });
      await refreshReservations();
    } catch (err) {
      console.warn('El reembolso quedó pendiente de proceso:', err);
    }
  };

  // Reembolsos que quedaron pendientes (p. ej. una solicitud que el anfitrión no
  // respondió a tiempo y la base rechazó sola): se reintentan al cargar las
  // reservas, una vez por sesión y reserva. La API valida que quien la llama sea
  // arrendatario, propietario o administración de esa reserva.
  const refundAttempts = useRef(new Set<string>());
  useEffect(() => {
    if (!currentUser || !isSupabaseConfigured()) return;
    const pending = reservations.filter(
      (r) =>
        r.paymentStatus === 'refund_pending' &&
        (r.tenantId === currentUser.id || r.ownerId === currentUser.id) &&
        !refundAttempts.current.has(r.id)
    );
    pending.forEach((r) => {
      refundAttempts.current.add(r.id);
      callApi('/api/webpay?action=refund', { reservationId: r.id })
        .then(() => refreshReservations())
        .catch((err) => console.warn('El reembolso sigue pendiente:', err));
    });
  }, [reservations, currentUser?.id]);

  // Cancelación con cálculo de reembolso en servidor (RF-18).
  const cancelReservation = async (reservationId: string, reason?: string): Promise<Reservation | undefined> => {
    const result = await updateReservationInDb(reservationId, {
      status: 'cancelled',
      cancellationReason: reason?.trim() || undefined,
    });
    if (!result.success) {
      throw new Error(result.error || 'No se pudo cancelar la reserva.');
    }
    if (result.data) {
      setReservations((prev) => prev.map((r) => (r.id === reservationId ? result.data! : r)));
    }
    await processPendingRefund(result.data);
    return result.data;
  };

  const submitReport = async (report: {
    targetType: 'space' | 'user';
    targetSpaceId?: string;
    targetUserId?: string;
    targetLabel: string;
    category: string;
    description: string;
  }) => {
    if (!currentUser) throw new Error('Debes iniciar sesión para reportar.');
    await insertReportToDb({ ...report, reporterId: currentUser.id, reporterEmail: currentUser.email });
  };

  // Creación de espacio por un propietario (Supabase DB)
  const createSpace = (
    spaceData: Omit<Space, 'id' | 'ownerId' | 'ownerName' | 'ownerRut' | 'ownerVerified' | 'rating' | 'reviewsCount' | 'createdAt'>
  ) => {
    if (!currentUser) {
      alert('Debes iniciar sesión para publicar un espacio.');
      return;
    }

    if (!currentUser.ownerTermsAccepted && currentUser.role !== 'admin') {
      alert('Debes aceptar los términos de propietario antes de publicar un espacio.');
      return;
    }

    const newSpace: Space = {
      ...spaceData,
      id: `spc-${Date.now()}`,
      ownerId: currentUser.id,
      ownerName: currentUser.fullName,
      ownerRut: currentUser.rut,
      ownerVerified: currentUser.verificationStatus === 'verified',
      rating: 0,
      reviewsCount: 0,
      createdAt: new Date().toISOString(),
    };

    setSpaces((prev) => [newSpace, ...prev]);

    // Persistir en Supabase DB
    if (isSupabaseConfigured()) {
      insertSpaceToDb(newSpace)
        .then((result) => {
          if (result.success && result.data?.id) {
            // Reemplaza el id temporal por el definitivo de la base (y su estado de moderación).
            setSpaces((prev) =>
              prev.map((s) =>
                s.id === newSpace.id ? { ...s, id: result.data.id, status: result.data.status ?? s.status } : s
              )
            );
          } else if (!result.success) {
            setSpaces((prev) => prev.filter((s) => s.id !== newSpace.id));
            alert(`No se pudo publicar el espacio: ${result.error || 'error desconocido'}`);
          }
        })
        .catch((err) => console.warn('Error al guardar espacio en Supabase DB:', err));
    }

    addAuditRecord('SPACE_PUBLISHED', 'info', {
      spaceId: newSpace.id,
      title: newSpace.title,
      pricePerDay: newSpace.pricePerDay,
      commune: newSpace.commune,
    });

    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        userId: currentUser.id,
        title: 'Espacio publicado exitosamente',
        message: `Tu espacio "${newSpace.title}" ha sido enviado y está en estado ${newSpace.status === 'active' ? 'activo' : 'en revisión por moderación'}.`,
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ]);
  };

  const requestVisit = (data: Omit<VisitRequest, 'id' | 'createdAt' | 'status'>): VisitRequest => {
    const newVisit: VisitRequest = {
      ...data,
      id: `vis-${Date.now()}`,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };

    setVisitRequests((prev) => [newVisit, ...prev]);

    if (isSupabaseConfigured()) {
      insertVisitRequestToDb(newVisit).catch(console.warn);
    }

    addAuditRecord('VISIT_REQUESTED', 'info', {
      visitId: newVisit.id,
      spaceId: newVisit.spaceId,
      visitDate: newVisit.visitDate,
      visitTimeSlot: newVisit.visitTimeSlot,
      modality: newVisit.modality,
    });

    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        userId: currentUser ? currentUser.id : 'guest',
        title: 'Solicitud de visita agendada',
        message: `Se ha coordinado tu visita para "${data.spaceTitle}" para el ${data.visitDate} (${data.visitTimeSlot}). El anfitrión ${data.ownerName} ha sido notificado.`,
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ]);

    return newVisit;
  };

  const updateSpace = (id: string, updates: Partial<Space>) => {
    setSpaces((prev) =>
      prev.map((spc) => (spc.id === id ? { ...spc, ...updates } : spc))
    );

    if (isSupabaseConfigured()) {
      updateSpaceInDb(id, updates).catch(console.warn);
    }

    addAuditRecord('SPACE_UPDATED', 'info', { spaceId: id, updates });
  };

  // RF-10: un espacio con reservas registradas se despublica (los contratos firmados
  // son inmutables y deben conservarse); uno sin historial se elimina.
  // Eliminación de una publicación por su propietario (o administración).
  // La base decide: si nunca tuvo reservas se borra; si tiene historial (contratos,
  // pagos) se archiva como "eliminada" para conservar los registros legales, y ya no
  // aparece en el catálogo ni en el panel. Con reservas activas o próximas no se
  // permite eliminar.
  const deleteSpace = async (id: string): Promise<{ success: boolean; message: string }> => {
    const today = getTodayIso();
    const blocking = reservations.some(
      (r) => r.spaceId === id && (r.status === 'pending' || r.status === 'confirmed') && r.endDate >= today
    );
    if (blocking) {
      return {
        success: false,
        message: 'Esta publicación tiene reservas activas o próximas. Cancélalas o espera a que terminen antes de eliminarla.',
      };
    }

    if (!isSupabaseConfigured()) {
      setSpaces((prev) => prev.filter((spc) => spc.id !== id));
      setSpaceBlocks((prev) => prev.filter((b) => b.spaceId !== id));
      addAuditRecord('SPACE_DELETED', 'warning', { spaceId: id });
      return { success: true, message: 'Publicación eliminada.' };
    }

    const { data, error } = await supabase.rpc('owner_delete_space', { p_space_id: id });
    if (error) {
      return { success: false, message: error.message };
    }
    setSpaces((prev) => prev.filter((spc) => spc.id !== id));
    setSpaceBlocks((prev) => prev.filter((b) => b.spaceId !== id));
    return {
      success: true,
      message:
        data === 'archived'
          ? 'Publicación eliminada. Como tuvo reservas, sus contratos y pagos quedan guardados en el historial.'
          : 'Publicación eliminada.',
    };
  };

  // Bloqueos de disponibilidad (por horas, días o mes completo).
  const addSpaceBlock = async (
    block: Omit<SpaceBlock, 'id' | 'ownerId' | 'createdAt'>
  ): Promise<{ success: boolean; message?: string }> => {
    if (!currentUser) return { success: false, message: 'Debes iniciar sesión.' };
    const today = getTodayIso();
    if (block.startDate < today) {
      return { success: false, message: 'Solo puedes bloquear desde hoy en adelante.' };
    }
    if (block.endDate < block.startDate) {
      return { success: false, message: 'La fecha de término debe ser igual o posterior a la de inicio.' };
    }
    if (block.hourStart != null && block.hourEnd != null && block.hourEnd <= block.hourStart) {
      return { success: false, message: 'La hora de término debe ser posterior a la de inicio.' };
    }

    if (!isSupabaseConfigured()) {
      const local: SpaceBlock = { ...block, id: `blk-${Date.now()}`, ownerId: currentUser.id };
      setSpaceBlocks((prev) => [...prev, local]);
      return { success: true };
    }

    const result = await insertSpaceBlockToDb(block);
    if (!result.success || !result.data) {
      return { success: false, message: result.error || 'No se pudo guardar el bloqueo.' };
    }
    setSpaceBlocks((prev) => [...prev.filter((b) => b.id !== result.data!.id), result.data!]);
    return { success: true };
  };

  const removeSpaceBlock = async (id: string): Promise<{ success: boolean; message?: string }> => {
    const result = await deleteSpaceBlockFromDb(id);
    if (!result.success) return { success: false, message: result.error };
    setSpaceBlocks((prev) => prev.filter((b) => b.id !== id));
    return { success: true };
  };

  // Cambio de estado por el propietario o administración (RF-20). La base valida la
  // transición, calcula el reembolso y genera notificaciones y auditoría.
  const updateReservationStatus = async (reservationId: string, status: ReservationStatus) => {
    const targetReservation = reservations.find((r) => r.id === reservationId);

    if (status === 'confirmed' && targetReservation) {
      const todayStr = getTodayIso();
      const resDate = targetReservation.endDate || targetReservation.startDate;
      if (resDate < todayStr) {
        throw new Error('No es posible aprobar una reserva cuya fecha ya transcurrió.');
      }
      if (targetReservation.paymentStatus === 'pending' || targetReservation.paymentStatus === 'failed') {
        throw new Error('La reserva no se puede aceptar hasta que Webpay apruebe el pago.');
      }
    }

    if (!isSupabaseConfigured()) {
      setReservations((prev) => prev.map((res) => (res.id === reservationId ? { ...res, status } : res)));
      return;
    }

    const result = await updateReservationInDb(reservationId, { status });
    if (!result.success) {
      throw new Error(result.error || 'No se pudo actualizar la reserva.');
    }
    if (result.data) {
      setReservations((prev) => prev.map((res) => (res.id === reservationId ? result.data! : res)));
    }
    await processPendingRefund(result.data);
  };

  // RF-32: suspensión de cuentas por administración.
  const adminSetUserSuspension = async (userId: string, suspend: boolean, reason: string) => {
    await setUserSuspensionInDb(userId, suspend, reason);
    setAllUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, isSuspended: suspend, suspendedReason: suspend ? reason : undefined } : u
      )
    );
    if (suspend) {
      setSpaces((prev) => prev.map((s) => (s.ownerId === userId && s.status === 'active' ? { ...s, status: 'paused' } : s)));
    }
  };

  // Acciones exclusivas del Administrador
  const adminApproveKyc = (userId: string) => {
    setAllUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              verificationStatus: 'verified',
              kycRejectionReason: undefined,
              kycData: u.kycData
                ? { ...u.kycData, rejectionReason: undefined, rejectedAt: undefined }
                : undefined,
            }
          : u
      )
    );
    if (currentUser && currentUser.id === userId) {
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              verificationStatus: 'verified',
              kycRejectionReason: undefined,
              kycData: prev.kycData
                ? { ...prev.kycData, rejectionReason: undefined, rejectedAt: undefined }
                : undefined,
            }
          : null
      );
    }

    if (isSupabaseConfigured()) {
      updateProfileInDb(userId, {
        verificationStatus: 'verified',
        kycRejectionReason: undefined,
      }).catch(console.warn);
    }

    setNotifications((prev) => [
      {
        id: `notif-kyc-ok-${Date.now()}`,
        userId,
        title: 'Solicitud de verificación aprobada',
        message:
          'El Administrador ha aprobado tu verificación de identidad (cédula, biometría y certificado de antecedentes). Tu cuenta ya se encuentra habilitada para reservar.',
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ]);
    addAuditRecord('ADMIN_KYC_APPROVED', 'security', {
      targetUserId: userId,
      adminId: currentUser ? currentUser.id : 'admin',
    });
  };

  const adminRejectKyc = (userId: string, reason: string) => {
    const cleanReason =
      reason.trim() ||
      'La documentación enviada presenta observaciones o no es legible. Por favor vuelve a subir tus documentos.';
    const rejectedAtIso = new Date().toISOString();

    setAllUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              verificationStatus: 'rejected',
              kycRejectionReason: cleanReason,
              kycData: {
                ...(u.kycData || {
                  consentGiven: true,
                  termsVersion: 'VERIFICACION-2026.1',
                  photoCaptured: false,
                  idFrontCaptured: false,
                  idBackCaptured: false,
                  rutNumber: u.rut,
                  documentSerialNumber: '',
                  criminalRecordSubmitted: false,
                }),
                rejectionReason: cleanReason,
                rejectedAt: rejectedAtIso,
              },
            }
          : u
      )
    );

    if (currentUser && currentUser.id === userId) {
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              verificationStatus: 'rejected',
              kycRejectionReason: cleanReason,
              kycData: {
                ...(prev.kycData || {
                  consentGiven: true,
                  termsVersion: 'VERIFICACION-2026.1',
                  photoCaptured: false,
                  idFrontCaptured: false,
                  idBackCaptured: false,
                  rutNumber: prev.rut,
                  documentSerialNumber: '',
                  criminalRecordSubmitted: false,
                }),
                rejectionReason: cleanReason,
                rejectedAt: rejectedAtIso,
              },
            }
          : null
      );
    }

    if (isSupabaseConfigured()) {
      updateProfileInDb(userId, {
        verificationStatus: 'rejected',
        kycRejectionReason: cleanReason,
      }).catch(console.warn);
    }

    setNotifications((prev) => [
      {
        id: `notif-kyc-rej-${Date.now()}`,
        userId,
        title: 'Solicitud de verificación rechazada',
        message: `Estado de tu solicitud: Rechazada por el Administrador. Motivo informado: "${cleanReason}". Puedes revisar el detalle y volver a enviar tus documentos en Verificación de Identidad.`,
        type: 'warning',
        timestamp: rejectedAtIso,
        read: false,
      },
      ...prev,
    ]);

    addAuditRecord('ADMIN_KYC_REJECTED', 'security', {
      targetUserId: userId,
      adminId: currentUser ? currentUser.id : 'admin',
      reason: cleanReason,
    });
  };

  const adminToggleSpaceStatus = (spaceId: string, status: 'active' | 'paused' | 'pending_approval') => {
    setSpaces((prev) =>
      prev.map((s) => (s.id === spaceId ? { ...s, status, isVerified: status === 'active' } : s))
    );

    if (isSupabaseConfigured()) {
      updateSpaceInDb(spaceId, { status, isVerified: status === 'active' }).catch(console.warn);
    }

    addAuditRecord('ADMIN_SPACE_STATUS_MODERATED', 'security', {
      spaceId,
      newStatus: status,
      adminId: currentUser ? currentUser.id : 'admin',
    });
  };

  const adminResolveDispute = (disputeId: string, resolution: 'resolved_refund' | 'resolved_owner', notes: string) => {
    const targetDispute = disputes.find((d) => d.id === disputeId);
    setDisputes((prev) =>
      prev.map((d) =>
        d.id === disputeId
          ? {
              ...d,
              status: resolution,
              resolutionNotes: notes,
              resolvedAt: new Date().toISOString(),
            }
          : d
      )
    );

    if (isSupabaseConfigured()) {
      updateDisputeInDb(disputeId, {
        status: resolution,
        resolutionNotes: notes,
        resolvedAt: new Date().toISOString(),
      }).catch(console.warn);
    }

    if (targetDispute?.reservationId) {
      setReservations((prev) =>
        prev.map((r) =>
          r.id === targetDispute.reservationId
            ? {
                ...r,
                disputeStatus: 'resolved',
                status: resolution === 'resolved_refund' ? 'cancelled' : r.status,
              }
            : r
        )
      );

      if (isSupabaseConfigured()) {
        updateReservationInDb(targetDispute.reservationId, {
          disputeStatus: 'resolved',
          status: resolution === 'resolved_refund' ? 'cancelled' : undefined,
        }).catch(console.warn);
      }
    }

    if (targetDispute?.tenantId) {
      setNotifications((prev) => [
        {
          id: `notif-disp-res-${Date.now()}`,
          userId: targetDispute.tenantId!,
          title: 'Disputa resuelta por administración',
          message: `Tu reclamo sobre "${targetDispute.spaceTitle}" fue resuelto (${
            resolution === 'resolved_refund'
              ? 'Reembolso del 100% autorizado: Arriendo + garantía + 5% comisión'
              : 'Caso cerrado con liberación de fondos al propietario'
          }). Dictamen: ${notes}`,
          type: resolution === 'resolved_refund' ? 'success' : 'info',
          timestamp: new Date().toISOString(),
          read: false,
        },
        ...prev,
      ]);
    }

    addAuditRecord('ADMIN_DISPUTE_RESOLVED', 'security', {
      disputeId,
      resolution,
      notes,
    });
  };

  const createDispute = (
    reservationId: string,
    reason: string,
    options?: { spaceId?: string; problemCategory?: string }
  ): Dispute | undefined => {
    const res = reservations.find((r) => r.id === reservationId);
    const spc =
      spaces.find((s) => s.id === (options?.spaceId || res?.spaceId || reservationId)) ||
      spaces[0];

    if (!res && !spc) return undefined;

    const formattedReason = options?.problemCategory
      ? `[${options.problemCategory}] ${reason.trim()}`
      : reason.trim();

    const fallbackSubtotal = spc.pricePerDay || 120000;
    const fallbackDeposit = spc.securityDeposit || 60000;
    const fallbackFee = Math.round(fallbackSubtotal * 0.05);

    const subtotalClp = res ? res.subtotalClp : fallbackSubtotal;
    const securityDepositClp = res ? res.securityDepositClp : fallbackDeposit;
    const platformFeeClp = res ? res.platformFeeClp : fallbackFee;
    const totalCustodyClp = res ? res.totalClp : subtotalClp + securityDepositClp + platformFeeClp;

    const newDispute: Dispute = {
      id: `disp-${Date.now()}`,
      reservationId: res ? res.id : `soporte-${Date.now().toString().slice(-5)}`,
      spaceId: res ? res.spaceId : spc?.id,
      spaceTitle: res ? res.spaceTitle : spc.title,
      tenantId: currentUser?.id || res?.tenantId || 'guest',
      tenantName: res ? res.tenantName : currentUser?.fullName || 'Usuario Spotly',
      tenantRut: res ? res.tenantRut : currentUser?.rut || '18.421.905-3',
      ownerName: res ? res.ownerName : spc.ownerName,
      ownerRut: (res ? res.ownerRut : spc.ownerRut) || '14.258.963-7',
      subtotalClp,
      securityDepositClp,
      platformFeeClp,
      amountClp: totalCustodyClp,
      problemCategory: options?.problemCategory,
      reason: formattedReason,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    setDisputes((prev) => [newDispute, ...prev]);

    if (isSupabaseConfigured()) {
      insertDisputeToDb(newDispute).catch(console.warn);
    }

    if (res) {
      setReservations((prev) =>
        prev.map((r) =>
          r.id === res.id ? { ...r, disputeStatus: 'opened', disputeReason: formattedReason } : r
        )
      );

      if (isSupabaseConfigured()) {
        updateReservationInDb(res.id, {
          disputeStatus: 'opened',
          disputeReason: formattedReason,
        }).catch(console.warn);
      }
    }

    if (currentUser) {
      setNotifications((prev) => [
        {
          id: `notif-disp-${Date.now()}`,
          userId: currentUser.id,
          title: 'Reporte de problema / disputa registrada',
          message: `Se ha registrado tu reclamo sobre "${newDispute.spaceTitle}" (Código #${newDispute.id}). El equipo de Soporte y Administración revisará el caso.`,
          type: 'info',
          timestamp: new Date().toISOString(),
          read: false,
        },
        ...prev,
      ]);
    }

    addAuditRecord('DISPUTE_OPENED', 'warning', {
      disputeId: newDispute.id,
      reservationId: newDispute.reservationId,
      spaceTitle: newDispute.spaceTitle,
      tenantRut: newDispute.tenantRut,
      reason: formattedReason,
    });

    return newDispute;
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (!id.startsWith('notif-')) {
      deleteNotificationFromDb(id).catch(console.warn);
    }
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (currentUser) {
      markNotificationsReadInDb(currentUser.id).catch(console.warn);
    }
  };

  // Billetera: tarjetas inscritas en Transbank Oneclick (Spotly solo ve tipo y últimos 4 dígitos).
  const refreshWalletCards = async () => {
    if (!currentUser || !isSupabaseConfigured()) {
      setWalletCards([]);
      return;
    }
    try {
      setWalletCards(await fetchWalletCards());
    } catch (err) {
      console.warn('No se pudieron cargar las tarjetas de la billetera:', err);
    }
  };

  useEffect(() => {
    refreshWalletCards();
  }, [currentUser?.id]);

  // Redirige al formulario de Transbank para inscribir una tarjeta.
  const addWalletCard = async (returnTo?: string) => {
    const { url, token } = await callApi<{ url: string; token: string }>('/api/wallet?action=inscribe', { returnTo });
    postToTransbank(url, 'TBK_TOKEN', token);
  };

  const removeWalletCard = async (cardId: string) => {
    await callApi('/api/wallet?action=remove', { cardId });
    await refreshWalletCards();
  };

  const setDefaultWalletCard = async (cardId: string) => {
    await callApi('/api/wallet?action=default', { cardId });
    await refreshWalletCards();
  };

  // Cobro inmediato con una tarjeta guardada; si es rechazado, el servidor libera el horario.
  const payWithWalletCard = async (reservationId: string, cardId: string) => {
    try {
      await callApi('/api/wallet?action=pay', { reservationId, cardId });
    } finally {
      await refreshReservations();
    }
  };

  // Espacios con los datos privados que el usuario actual está autorizado a ver.
  const visibleSpaces = useMemo(
    () =>
      spaces.map((s) => {
        const details = spacePrivateDetails[s.id];
        return details ? { ...s, ownerRut: details.ownerRut, address: details.address } : s;
      }),
    [spaces, spacePrivateDetails]
  );

  // Auxiliar para saber si el usuario actual tiene permisos de propietario
  const isOwnerCapable = useMemo(() => {
    if (!currentUser) return false;
    return currentUser.role === 'owner' || (currentUser.role === 'admin' && currentUser.ownerTermsAccepted);
  }, [currentUser]);

  const favoriteSpaceIds = useMemo(() => {
    if (!currentUser) return [];
    return favoritesByUser[currentUser.id] || [];
  }, [favoritesByUser, currentUser]);

  const isSpaceFavorite = (spaceId: string): boolean => {
    if (!currentUser) return false;
    return favoriteSpaceIds.includes(spaceId);
  };

  const toggleFavoriteSpace = (spaceId: string) => {
    if (!currentUser) return;
    const userKey = currentUser.id;
    setFavoritesByUser((prev) => {
      const currentList = prev[userKey] || [];
      const exists = currentList.includes(spaceId);
      const nextList = exists
        ? currentList.filter((id) => id !== spaceId)
        : [spaceId, ...currentList];
      return {
        ...prev,
        [userKey]: nextList,
      };
    });

    const targetSpace = spaces.find((s) => s.id === spaceId);
    const wasFav = favoriteSpaceIds.includes(spaceId);
    setFavoriteInDb(userKey, spaceId, !wasFav).catch(console.warn);

    addAuditRecord(wasFav ? 'SPACE_FAVORITE_REMOVED' : 'SPACE_FAVORITE_ADDED', 'info', {
      spaceId,
      spaceTitle: targetSpace?.title || spaceId,
    });
  };

  const clearFavorites = () => {
    if (!currentUser) return;
    const userKey = currentUser.id;
    setFavoritesByUser((prev) => ({
      ...prev,
      [userKey]: [],
    }));
    clearFavoritesInDb(userKey).catch(console.warn);
    addAuditRecord('FAVORITES_CLEARED', 'info', { userId: userKey });
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        authReady,
        allUsers,
        profilesLoadError,
        spaces: visibleSpaces,
        reservations,
        contracts,
        auditLogs,
        disputes,
        notifications: currentUser ? notifications.filter((n) => n.userId === currentUser.id) : [],
        walletCards,
        visitRequests,
        payments,
        requestVisit,
        refreshWalletCards,
        addWalletCard,
        removeWalletCard,
        setDefaultWalletCard,
        payWithWalletCard,
        switchUser,
        login,
        logout,
        register,
        verifyEmail,
        resendVerificationCode,
        requestPasswordReset,
        resetPassword,
        updateUserProfile,
        updateUserRole,
        upgradeTenantToOwner,
        createBooking,
        startWebpayPayment,
        cancelReservation,
        refreshReservations,
        submitReport,
        createSpace,
        updateSpace,
        deleteSpace,
        spaceBlocks,
        addSpaceBlock,
        removeSpaceBlock,
        updateReservationStatus,
        adminApproveKyc,
        adminRejectKyc,
        adminSetUserSuspension,
        adminToggleSpaceStatus,
        adminResolveDispute,
        createDispute,
        addAuditRecord,
        dismissNotification,
        markAllNotificationsRead,
        isOwnerCapable,
        favoriteSpaceIds,
        toggleFavoriteSpace,
        isSpaceFavorite,
        clearFavorites,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp debe ser usado dentro de un AppProvider');
  }
  return context;
};
