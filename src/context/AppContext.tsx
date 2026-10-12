import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
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
  SavedCard,
  ReservationStatus,
  DigitalContract,
  VisitRequest,
  PaymentRecord,
} from '../types.ts';
import { saveAuditLog, getAuditLogs, buildAuditMetadata, fetchClientIp, SERVER_RECORDED_IP } from '../utils/auditLogger.ts';
import { callApi } from '../utils/api.ts';
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
  insertAuditLogToDb,
  getDisputesFromDb,
  insertDisputeToDb,
  updateDisputeInDb,
  getProfilesFromDb,
  updateProfileInDb,
  getVisitRequestsFromDb,
  insertVisitRequestToDb,
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
  getLoginLockStatus,
  registerFailedLogin,
  resetLoginAttempts,
  isRutAvailable,
} from '../lib/dataAccess.ts';

interface AppContextType {
  currentUser: UserProfile | null;
  allUsers: UserProfile[];
  profilesLoadError: string | null;
  spaces: Space[];
  reservations: Reservation[];
  contracts: DigitalContract[];
  auditLogs: AuditLog[];
  disputes: Dispute[];
  notifications: NotificationItem[];
  savedCards: SavedCard[];
  visitRequests: VisitRequest[];
  payments: PaymentRecord[];
  requestVisit: (data: Omit<VisitRequest, 'id' | 'createdAt' | 'status'>) => VisitRequest;
  addSavedCard: (cardData: {
    cardBrand: 'visa' | 'mastercard' | 'redcompra';
    cardHolder: string;
    last4: string;
    expiryMonth: string;
    expiryYear: string;
    bankName: string;
    isDefault?: boolean;
  }) => void;
  deleteSavedCard: (cardId: string) => void;
  setDefaultCard: (cardId: string) => void;
  // Role & Session actions
  switchUser: (userId: string | null) => void;
  login: (emailOrRut: string, password?: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
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
  deleteSpace: (id: string) => void;
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

const AppContext = createContext<AppContextType | undefined>(undefined);

const INITIAL_SAVED_CARDS: SavedCard[] = [];

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [profilesLoadError, setProfilesLoadError] = useState<string | null>(
    isSupabaseConfigured() ? null : 'Supabase no está configurado para esta aplicación.'
  );
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [contracts, setContracts] = useState<DigitalContract[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [savedCards, setSavedCards] = useState<SavedCard[]>(INITIAL_SAVED_CARDS);
  const [visitRequests, setVisitRequests] = useState<VisitRequest[]>([]);
  const [favoritesByUser, setFavoritesByUser] = useState<Record<string, string[]>>({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => getAuditLogs());
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  // Notificaciones: se persisten en Supabase (tabla notifications) y llegan en tiempo real.
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Carga de datos propios del usuario autenticado y suscripción en tiempo real.
  useEffect(() => {
    if (!currentUser || !isSupabaseConfigured()) {
      setNotifications([]);
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
    getPaymentsFromDb().then((items) => {
      if (active) setPayments(items);
    });

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

  // Una cuenta suspendida no puede mantener la sesión abierta (RF-32).
  useEffect(() => {
    if (currentUser?.isSuspended) {
      supabase.auth.signOut().catch(() => undefined);
      setCurrentUser(null);
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
    setAuditLogs((prev) => [log, ...prev]);

    // Persistir en Supabase DB si está configurado
    if (isSupabaseConfigured()) {
      insertAuditLogToDb(log).catch((err) => {
        console.warn('Error al guardar log de auditoría en Supabase:', err);
      });
    }
  };

  // Inicialización y Carga de Datos desde Supabase al montar el componente
  useEffect(() => {
    let isMounted = true;

    async function initializeSupabaseData() {
      if (!isSupabaseConfigured()) return;

      try {
        // 1. Verificar sesión activa de Supabase Auth
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user && isMounted) {
          const userId = sessionData.session.user.id;
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

          if (profile && isMounted) {
            const loadedUser: UserProfile = {
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
            };
            setCurrentUser(loadedUser);
          }
        }

        // 2. Cargar tablas desde Supabase DB
        let profileError: string | null = null;
        const profilesPromise = getProfilesFromDb().catch((profileLoadErr) => {
          profileError = profileLoadErr instanceof Error ? profileLoadErr.message : 'No se pudieron cargar los perfiles.';
          return [];
        });
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
          getReservationsFromDb(),
          getContractsFromDb(),
          getDisputesFromDb(),
          getVisitRequestsFromDb(),
          getAuditLogsFromDb(),
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

    // 3. Listener en tiempo real de cambios de Auth (Login, Logout, etc.)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        if (event === 'SIGNED_OUT') {
          setCurrentUser(null);
        } else if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile && isMounted) {
            setCurrentUser({
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
          }
        }
      }
    );

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  // Inicio de sesión por Email o RUT (Supabase Auth con Fallback local)
  const login = async (emailOrRut: string, password?: string): Promise<{ success: boolean; message?: string }> => {
    const cleanInput = emailOrRut.trim().toLowerCase();

    // 1. Si Supabase está conectado, usamos Supabase Auth
    if (isSupabaseConfigured() && password) {
      let targetEmail = cleanInput;

      // Supabase Auth inicia sesión con correo; no se lee la tabla de perfiles desde una sesión anónima para resolver RUT.
      if (!cleanInput.includes('@')) {
        return { success: false, message: 'Credenciales inválidas. Revisa tu correo electrónico o contraseña.' };
      }

      // RNF-04: bloqueo temporal tras intentos fallidos consecutivos.
      const lock = await getLoginLockStatus(targetEmail);
      if (lock.locked) {
        const until = lock.lockedUntil ? new Date(lock.lockedUntil).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';
        return {
          success: false,
          message: `Cuenta bloqueada temporalmente por intentos fallidos. Intenta nuevamente${until ? ` después de las ${until}` : ' en unos minutos'}.`,
        };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password: password,
      });

      if (error) {
        console.warn('Supabase Auth error:', error.message);
        if (error.message.toLowerCase().includes('email not confirmed')) {
          return {
            success: false,
            message: 'Confirma tu correo electrónico desde el mensaje que te enviamos y luego inicia sesión.',
          };
        }
        const attempt = await registerFailedLogin(targetEmail);
        return {
          success: false,
          message: attempt.locked
            ? 'Demasiados intentos fallidos: la cuenta quedó bloqueada por 15 minutos.'
            : `Credenciales inválidas. Revisa tu correo electrónico o contraseña.${
                attempt.remaining !== undefined && attempt.remaining <= 2
                  ? ` Te quedan ${attempt.remaining} intento${attempt.remaining === 1 ? '' : 's'} antes del bloqueo temporal.`
                  : ''
              }`,
        };
      }

      await resetLoginAttempts();

      if (data.user) {
        // Cargar datos de perfil desde la tabla profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        const loggedUser: UserProfile = profile
          ? {
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
            }
          : {
              id: data.user.id,
              fullName: formatFullName(data.user.user_metadata?.first_names, data.user.user_metadata?.surnames, data.user.user_metadata?.full_name || 'Usuario Spotly'),
              firstNames: data.user.user_metadata?.first_names ? capitalizeInitial(data.user.user_metadata.first_names) : undefined,
              surnames: data.user.user_metadata?.surnames ? capitalizeInitial(data.user.user_metadata.surnames) : undefined,
              email: data.user.email || targetEmail,
              rut: data.user.user_metadata?.rut || '',
              phone: data.user.user_metadata?.phone || '',
              role: data.user.user_metadata?.role || 'tenant',
              ownerTermsAccepted: data.user.user_metadata?.owner_terms_accepted || false,
              verificationStatus: 'unverified',
              createdAt: new Date().toISOString(),
            };

        if (loggedUser.isSuspended) {
          await supabase.auth.signOut();
          return {
            success: false,
            message: `Tu cuenta está suspendida por administración${
              loggedUser.suspendedReason ? ` (motivo: ${loggedUser.suspendedReason})` : ''
            }. Escríbenos desde Ayuda y soporte.`,
          };
        }

        setCurrentUser(loggedUser);
        try {
          setAllUsers(await getProfilesFromDb());
          setProfilesLoadError(null);
        } catch (profileLoadErr) {
          setProfilesLoadError(profileLoadErr instanceof Error ? profileLoadErr.message : 'No se pudieron cargar los perfiles.');
        }
        // El registro se inserta con la sesión recién creada (user_id = auth.uid()).
        insertAuditLogToDb({
          id: '',
          action: 'USER_LOGGED_IN',
          severity: 'security',
          userId: loggedUser.id,
          userEmail: loggedUser.email,
          userRole: loggedUser.role,
          ip: SERVER_RECORDED_IP,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          timestamp: new Date().toISOString(),
          details: { method: 'password' },
        }).catch(() => undefined);

        return {
          success: true,
          message: `¡Bienvenido nuevamente, ${loggedUser.fullName.split(' ')[0]}!`,
        };
      }
    }

    // 2. Fallback de desarrollo local si Supabase no está configurado o si no se proporcionó contraseña
    const found = allUsers.find(
      (u) =>
        u.email.toLowerCase() === cleanInput ||
        u.rut.toLowerCase().replace(/[^0-9k]/g, '') === cleanInput.replace(/[^0-9k]/g, '')
    );

    if (!found) {
      return {
        success: false,
        message: 'No existe una cuenta registrada con este correo o RUT en Spotly Chile.',
      };
    }

    setCurrentUser(found);
    addAuditRecord('USER_LOGGED_IN', 'security', {
      userId: found.id,
      userEmail: found.email,
      userRole: found.role,
    });

    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        userId: found.id,
        title: `Sesión iniciada como ${found.role === 'admin' ? 'Administrador' : found.role === 'owner' ? 'Propietario' : 'Arrendatario'}`,
        message: `Hola de nuevo, ${found.fullName}. Has ingresado a tu cuenta.`,
        type: 'info',
        timestamp: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ]);

    return {
      success: true,
      message: `¡Bienvenido nuevamente, ${found.fullName.split(' ')[0]}!`,
    };
  };

  // Cierre de sesión (Supabase Auth y memoria)
  const logout = async () => {
    if (currentUser) {
      addAuditRecord('USER_LOGGED_OUT', 'info', {
        userId: currentUser.id,
        userEmail: currentUser.email,
      });
    }

    if (isSupabaseConfigured()) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Error en supabase.auth.signOut:', err);
      }
    }

    setCurrentUser(null);
  };

  // Registro de nuevo usuario (Supabase Auth + Base de datos)
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

    const cleanEmail = userData.email.trim().toLowerCase();
    const cleanRut = userData.rut.replace(/[^0-9k]/gi, '').toLowerCase();

    // 1. Registro con Supabase Auth si está configurado
    if (isSupabaseConfigured()) {
      if (!userData.password) {
        return { success: false, message: 'Debes ingresar una contraseña.' };
      }
      if (!(await isRutAvailable(userData.rut))) {
        return { success: false, message: 'Ya existe una cuenta registrada con este RUT.' };
      }
      const userPassword = userData.password;
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password: userPassword,
        options: {
          data: {
            full_name: userData.fullName,
            first_names: userData.firstNames,
            surnames: userData.surnames,
            rut: userData.rut,
            phone: userData.phone,
            role: userData.role,
            owner_terms_accepted: userData.role === 'owner' ? userData.agreedTerms : false,
            gender: userData.gender,
            birth_date: userData.birthDate,
          },
        },
      });

      if (authError) {
        console.error('Error al registrar usuario en Supabase Auth:', authError.message);
        return {
          success: false,
          message: authError.message.toLowerCase().includes('database error')
            ? 'No se pudo crear la cuenta: el RUT o el correo ya están registrados.'
            : authError.message,
        };
      }

      if (authData.user && !authData.session) {
        return {
          success: true,
          requiresEmailConfirmation: true,
          message: 'Cuenta creada. Confirma tu correo electrónico y luego inicia sesión.',
        };
      }

      const assignedId = authData.user?.id || `usr-custom-${Date.now()}`;
      const newUser: UserProfile = {
        id: assignedId,
        fullName: userData.fullName,
        firstNames: userData.firstNames,
        surnames: userData.surnames,
        email: cleanEmail,
        rut: userData.rut,
        phone: userData.phone,
        gender: userData.gender,
        birthDate: userData.birthDate,
        avatarUrl: undefined,
        role: userData.role,
        ownerTermsAccepted: userData.role === 'owner' ? userData.agreedTerms : false,
        ownerApplicationDate: userData.role === 'owner' ? new Date().toISOString() : undefined,
        verificationStatus: 'unverified',
        createdAt: new Date().toISOString(),
      };

      // Guardar o actualizar registro en la tabla profiles
      await updateProfileInDb(assignedId, newUser);

      setAllUsers((prev) => [newUser, ...prev]);
      setCurrentUser(newUser);

      setNotifications((prev) => [
        {
          id: `notif-${Date.now()}`,
          userId: newUser.id,
          title: '🌟 ¡Bienvenido a Spotly Chile!',
          message: `¡Hola ${newUser.fullName}! Tu cuenta ha sido activada en Supabase Auth. Ya puedes explorar y reservar espacios o verificar tu identidad.`,
          type: 'success',
          timestamp: new Date().toISOString(),
          read: false,
        },
        ...prev,
      ]);

      return {
        success: true,
        message: '¡Cuenta registrada con éxito!',
      };
    }

    // 2. Fallback de desarrollo en memoria
    const existing = allUsers.find(
      (u) =>
        u.email.toLowerCase() === cleanEmail ||
        u.rut.replace(/[^0-9k]/gi, '').toLowerCase() === cleanRut
    );

    if (existing) {
      return {
        success: false,
        message: 'Ya existe una cuenta registrada con este correo electrónico o RUT.',
      };
    }

    const newUser: UserProfile = {
      id: `usr-custom-${Date.now()}`,
      fullName: userData.fullName,
      firstNames: userData.firstNames,
      surnames: userData.surnames,
      email: cleanEmail,
      rut: userData.rut,
      phone: userData.phone,
      gender: userData.gender,
      birthDate: userData.birthDate,
      avatarUrl: undefined,
      role: userData.role,
      ownerTermsAccepted: userData.role === 'owner' ? userData.agreedTerms : false,
      ownerApplicationDate: userData.role === 'owner' ? new Date().toISOString() : undefined,
      verificationStatus: 'unverified',
      createdAt: new Date().toISOString(),
    };

    setAllUsers((prev) => [newUser, ...prev]);
    setCurrentUser(newUser);

    addAuditRecord('USER_REGISTERED', 'security', {
      userId: newUser.id,
      userEmail: newUser.email,
      userRole: newUser.role,
      ownerTermsAccepted: newUser.ownerTermsAccepted,
      gender: newUser.gender,
      birthDate: newUser.birthDate,
    });

    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        userId: newUser.id,
        title: '🌟 ¡Bienvenido a Spotly Chile!',
        message: `¡Hola ${newUser.fullName}! Tu cuenta ha sido activada con éxito. Ya puedes explorar y reservar espacios o verificar tu identidad con tu carnet de identidad.`,
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ]);

    return {
      success: true,
      message: '¡Cuenta registrada con éxito!',
    };
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
        title: '✅ Datos actualizados',
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
        title: '¡Felicitaciones! Ahora eres Propietario en Spotly',
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
      spaceAddress: `${bookingData.space.address}, ${bookingData.space.commune}, ${bookingData.space.region}`,
      tenantName: currentUser.fullName,
      tenantRut: currentUser.rut,
      ownerName: bookingData.space.ownerName,
      ownerRut: bookingData.space.ownerRut,
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

    return { reservation: finalReservation, contract };
  };

  // Inicia el pago en Webpay Plus: el backend crea la transacción y el navegador
  // se redirige al formulario de Transbank (RF-17).
  const startWebpayPayment = async (reservationId: string) => {
    const { url, token } = await callApi<{ url: string; token: string }>('/api/webpay?action=create', {
      reservationId,
    });
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'token_ws';
    input.value = token;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
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
      insertSpaceToDb(newSpace).catch((err) =>
        console.warn('Error al guardar espacio en Supabase DB:', err)
      );
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
        title: 'Espacio Publicado Exitosamente',
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
        title: '📍 Solicitud de Visita Agendada',
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
  const deleteSpace = (id: string) => {
    const hasHistory = reservations.some((r) => r.spaceId === id);
    if (hasHistory) {
      updateSpace(id, { status: 'paused' });
      addAuditRecord('SPACE_UNPUBLISHED', 'warning', { spaceId: id, reason: 'Tiene reservas y contratos asociados' });
      alert('Este espacio tiene reservas y contratos asociados, por lo que se despublicó en lugar de eliminarse.');
      return;
    }

    setSpaces((prev) => prev.filter((spc) => spc.id !== id));

    if (isSupabaseConfigured()) {
      deleteSpaceFromDb(id).catch(console.warn);
    }

    addAuditRecord('SPACE_DELETED', 'warning', { spaceId: id });
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
        title: '✅ Solicitud de Verificación Aprobada',
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
        title: '⚠️ Solicitud de Verificación Rechazada',
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
          title: '⚖️ Disputa Resuelta por Administración',
          message: `Tu reclamo sobre "${targetDispute.spaceTitle}" fue resuelto (${
            resolution === 'resolved_refund'
              ? 'Reembolso del 100% autorizado: Arriendo + Garantía + 5% Comisión'
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
          title: '🛡️ Reporte de Problema / Disputa Registrada',
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

  // Gestión de Tarjetas y Billetera Bancaria
  const addSavedCard = (cardData: {
    cardBrand: 'visa' | 'mastercard' | 'redcompra';
    cardHolder: string;
    last4: string;
    expiryMonth: string;
    expiryYear: string;
    bankName: string;
    isDefault?: boolean;
  }) => {
    if (!currentUser) return;
    const newCard: SavedCard = {
      id: `card-${Date.now()}`,
      userId: currentUser.id,
      cardBrand: cardData.cardBrand,
      cardHolder: cardData.cardHolder.trim().toUpperCase(),
      last4: cardData.last4,
      expiryMonth: cardData.expiryMonth,
      expiryYear: cardData.expiryYear,
      bankName: cardData.bankName,
      isDefault: cardData.isDefault ?? false,
      createdAt: new Date().toISOString(),
    };

    setSavedCards((prev) => {
      let updated = prev;
      if (newCard.isDefault) {
        updated = updated.map((c) =>
          c.userId === currentUser.id ? { ...c, isDefault: false } : c
        );
      }
      return [newCard, ...updated];
    });

    addAuditRecord('CARD_REGISTERED', 'info', {
      cardBrand: newCard.cardBrand,
      last4: newCard.last4,
      bank: newCard.bankName,
    });
  };

  const deleteSavedCard = (cardId: string) => {
    if (!currentUser) return;
    setSavedCards((prev) => prev.filter((c) => c.id !== cardId));
    addAuditRecord('CARD_DELETED', 'info', { cardId });
  };

  const setDefaultCard = (cardId: string) => {
    if (!currentUser) return;
    setSavedCards((prev) =>
      prev.map((c) => {
        if (c.userId !== currentUser.id) return c;
        return { ...c, isDefault: c.id === cardId };
      })
    );
    addAuditRecord('CARD_SET_DEFAULT', 'info', { cardId });
  };

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
        allUsers,
        profilesLoadError,
        spaces,
        reservations,
        contracts,
        auditLogs,
        disputes,
        notifications: currentUser ? notifications.filter((n) => n.userId === currentUser.id) : [],
        savedCards,
        visitRequests,
        payments,
        requestVisit,
        addSavedCard,
        deleteSavedCard,
        setDefaultCard,
        switchUser,
        login,
        logout,
        register,
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
