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
} from '../types.ts';
import { saveAuditLog, getAuditLogs, getClientAuditMetadata } from '../utils/auditLogger.ts';
import { generateDigitalContract } from '../utils/contractGenerator.ts';
import { getTodayIso } from '../utils/formatters.ts';
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
  requestVisit: (data: Omit<VisitRequest, 'id' | 'createdAt' | 'status'>) => VisitRequest;
  quickVerifyUser: () => void;
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
  updateUserProfile: (data: Partial<UserProfile>) => void;
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
    paymentSimulation?: PaymentSimulationData;
  }) => Promise<{ reservation: Reservation; contract: DigitalContract }>;
  // Owner actions
  createSpace: (spaceData: Omit<Space, 'id' | 'ownerId' | 'ownerName' | 'ownerRut' | 'ownerVerified' | 'rating' | 'reviewsCount' | 'createdAt'>) => void;
  updateSpace: (id: string, spaceData: Partial<Space>) => void;
  deleteSpace: (id: string) => void;
  updateReservationStatus: (reservationId: string, status: ReservationStatus) => void;
  // Admin actions
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

  // Notificaciones en la sesión
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-welcome-1',
      userId: 'guest',
      title: '🌟 ¡Bienvenido a Spotly Chile!',
      message: 'Te damos una cálida bienvenida a la plataforma líder de arriendo de recintos comerciales, abiertos y cerrados en Chile. Explora espacios verificados con contratos digitales automáticos.',
      type: 'success',
      timestamp: new Date().toISOString(),
      read: false,
    },
    {
      id: 'notif-welcome-2',
      userId: 'guest',
      title: '🛡️ Seguridad Legal y Transbank Webpay',
      message: 'Todas las transacciones y reservas en Spotly cuentan con custodia de garantía segura y contratos respaldados por la Ley 18.101 de Chile.',
      type: 'info',
      timestamp: new Date().toISOString(),
      read: false,
    },
  ]);

  // Auditoría helper
  const addAuditRecord = (
    action: string,
    severity: 'info' | 'warning' | 'security' | 'critical',
    details: Record<string, unknown>
  ) => {
    const meta = getClientAuditMetadata();
    const log = saveAuditLog({
      action,
      severity,
      userId: currentUser ? currentUser.id : 'guest-anonymous',
      userEmail: currentUser ? currentUser.email : 'visitante@spotly.cl',
      userRole: currentUser ? currentUser.role : ('tenant' as UserRole),
      ip: meta.ip,
      userAgent: meta.userAgent,
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
              fullName: profile.full_name,
              firstNames: profile.first_names || undefined,
              surnames: profile.surnames || undefined,
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
              fullName: profile.full_name,
              firstNames: profile.first_names || undefined,
              surnames: profile.surnames || undefined,
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
        return { success: false, message: 'Ingresa el correo electrónico asociado a tu cuenta.' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password: password,
      });

      if (error) {
        console.warn('Supabase Auth error:', error.message);
        return {
          success: false,
          message: error.message.includes('Invalid login credentials')
            ? 'Credenciales no válidas. Revisa tu correo o RUT y contraseña.'
            : error.message.toLowerCase().includes('email not confirmed')
              ? 'Confirma tu correo electrónico desde el mensaje que te enviamos y luego inicia sesión.'
            : error.message,
        };
      }

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
              fullName: profile.full_name,
              firstNames: profile.first_names || undefined,
              surnames: profile.surnames || undefined,
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
              createdAt: profile.created_at,
            }
          : {
              id: data.user.id,
              fullName: data.user.user_metadata?.full_name || 'Usuario Spotly',
              firstNames: data.user.user_metadata?.first_names,
              surnames: data.user.user_metadata?.surnames,
              email: data.user.email || targetEmail,
              rut: data.user.user_metadata?.rut || '',
              phone: data.user.user_metadata?.phone || '',
              role: data.user.user_metadata?.role || 'tenant',
              ownerTermsAccepted: data.user.user_metadata?.owner_terms_accepted || false,
              verificationStatus: 'unverified',
              createdAt: new Date().toISOString(),
            };

        setCurrentUser(loggedUser);
        try {
          setAllUsers(await getProfilesFromDb());
          setProfilesLoadError(null);
        } catch (profileLoadErr) {
          setProfilesLoadError(profileLoadErr instanceof Error ? profileLoadErr.message : 'No se pudieron cargar los perfiles.');
        }
        addAuditRecord('USER_LOGGED_IN_SUPABASE', 'security', {
          userId: loggedUser.id,
          userEmail: loggedUser.email,
          userRole: loggedUser.role,
        });

        setNotifications((prev) => [
          {
            id: `notif-${Date.now()}`,
            userId: loggedUser.id,
            title: `Sesión iniciada como ${loggedUser.role === 'admin' ? 'Administrador' : loggedUser.role === 'owner' ? 'Propietario' : 'Arrendatario'}`,
            message: `Hola de nuevo, ${loggedUser.fullName}. Has ingresado a tu cuenta Spotly.`,
            type: 'info',
            timestamp: new Date().toISOString(),
            read: false,
          },
          ...prev,
        ]);

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
      const userPassword = userData.password || 'SpotlyChile2026!';
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
          message: authError.message,
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
  const updateUserProfile = (data: Partial<UserProfile>) => {
    if (!currentUser) return;

    const updatedUser: UserProfile = {
      ...currentUser,
      ...data,
    };

    setCurrentUser(updatedUser);
    setAllUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));

    // Actualizar en base de datos Supabase
    if (isSupabaseConfigured()) {
      updateProfileInDb(updatedUser.id, data).catch((err) => {
        console.warn('Error al sincronizar perfil en Supabase:', err);
      });
    }

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

    const auditMeta = getClientAuditMetadata('OWNER-TERMS-v2026.1');

    const updatedUser: UserProfile = {
      ...currentUser,
      role: 'owner',
      ownerTermsAccepted: true,
      ownerApplicationDate: new Date().toISOString(),
      verificationStatus: kycVerified ? 'verified' : currentUser.verificationStatus,
    };

    setCurrentUser(updatedUser);
    setAllUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));

    if (isSupabaseConfigured()) {
      updateProfileInDb(updatedUser.id, {
        role: 'owner',
        ownerTermsAccepted: true,
        ownerApplicationDate: updatedUser.ownerApplicationDate,
        verificationStatus: updatedUser.verificationStatus,
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

  // Creación de reserva por un arrendatario (Base de datos + Contrato Digital)
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
    paymentSimulation?: PaymentSimulationData;
  }): Promise<{ reservation: Reservation; contract: DigitalContract }> => {
    if (!currentUser) {
      throw new Error('Debes iniciar sesión para reservar un espacio.');
    }

    const todayStr = getTodayIso();
    if (bookingData.startDate < todayStr) {
      throw new Error('La fecha de la reserva debe ser desde el día actual hacia adelante.');
    }
    if (bookingData.endDate < bookingData.startDate) {
      throw new Error('La fecha de término no puede ser anterior a la fecha de inicio.');
    }

    const modality = bookingData.rentalModality || bookingData.space.rentalModality || 'por_dia';

    // VALIDACIÓN DE DISPONIBILIDAD ESTRICTA (ANTI-DOBLE RESERVA)
    const activeBookings = reservations.filter(
      (r) => r.spaceId === bookingData.space.id && r.status !== 'rejected' && r.status !== 'cancelled'
    );

    for (const existing of activeBookings) {
      const datesOverlap = bookingData.startDate <= existing.endDate && bookingData.endDate >= existing.startDate;
      if (datesOverlap) {
        if (modality === 'por_hora' && existing.rentalModality === 'por_hora' && bookingData.startDate === existing.startDate) {
          const newHStart = bookingData.hourStart ?? 9;
          const newHEnd = bookingData.hourEnd ?? (newHStart + bookingData.totalDays);
          const existHStart = existing.hourStart ?? 9;
          const existHEnd = existing.hourEnd ?? (existHStart + (existing.durationUnits || existing.totalDays));

          if (newHStart < existHEnd && newHEnd > existHStart) {
            throw new Error(
              `Conflicto de disponibilidad: El horario de ${newHStart}:00 a ${newHEnd}:00 del ${bookingData.startDate} ya se encuentra reservado en este recinto.`
            );
          }
        } else {
          const isExistingHourly = existing.rentalModality === 'por_hora';
          const isNewHourly = modality === 'por_hora';
          if (isNewHourly && isExistingHourly && bookingData.startDate !== existing.startDate) {
            continue;
          }
          throw new Error(
            `Conflicto de disponibilidad: El recinto "${bookingData.space.title}" ya tiene una reserva activa para las fechas seleccionadas (${existing.startDate} al ${existing.endDate}). Selecciona otras fechas u horario disponible.`
          );
        }

      }
    }

    const meta = getClientAuditMetadata();
    const reservationId = `RES-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Generar contrato digital formal chileno
    const contract = generateDigitalContract({
      reservationId,
      spaceTitle: bookingData.space.title,
      spaceAddress: `${bookingData.space.address}, ${bookingData.space.commune}, ${bookingData.space.region}`,
      tenantName: currentUser.fullName,
      tenantRut: currentUser.rut,
      ownerName: bookingData.space.ownerName,
      ownerRut: bookingData.space.ownerRut,
      totalClp: bookingData.totalClp,
      guaranteeDepositClp: bookingData.securityDepositClp,
      startDate: bookingData.startDate,
      endDate: bookingData.endDate,
      ip: meta.ip,
      rentalModality: modality,
      priceUnit: bookingData.priceUnit || (modality === 'por_hora' ? 'hour' : modality === 'mensual' ? 'month' : 'day'),
      durationUnits: bookingData.durationUnits || bookingData.totalDays,
      intendedUse: bookingData.intendedUse,
      signatureImage: bookingData.signatureImage,
      signatureType: bookingData.signatureType,
    });

    const newReservation: Reservation = {
      id: reservationId,
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
      priceUnit: bookingData.priceUnit || (modality === 'por_hora' ? 'hour' : modality === 'mensual' ? 'month' : 'day'),
      hourStart: bookingData.hourStart,
      hourEnd: bookingData.hourEnd,
      timeSlotString: bookingData.timeSlotString,
      rentalMonth: bookingData.rentalMonth,
      subtotalClp: bookingData.subtotalClp,
      platformFeeClp: bookingData.platformFeeClp,
      securityDepositClp: bookingData.securityDepositClp,
      totalClp: bookingData.totalClp,
      intendedUse: bookingData.intendedUse,
      paymentSimulation: bookingData.paymentSimulation,
      status: 'pending',
      digitalContractId: contract.id,
      createdAt: new Date().toISOString(),
    };

    setReservations((prev) => [newReservation, ...prev]);
    setContracts((prev) => [contract, ...prev]);

    // Persistir en Supabase DB
    if (isSupabaseConfigured()) {
      insertReservationToDb(newReservation).catch((err) =>
        console.warn('Error al guardar reserva en Supabase DB:', err)
      );
      insertContractToDb(contract).catch((err) =>
        console.warn('Error al guardar contrato en Supabase DB:', err)
      );
    }

    addAuditRecord('RESERVATION_CREATED_WITH_CONTRACT', 'info', {
      reservationId,
      contractId: contract.id,
      contractHash: contract.contractHash,
      spaceId: bookingData.space.id,
      totalClp: bookingData.totalClp,
      tenantRut: currentUser.rut,
      intendedUse: bookingData.intendedUse,
      paymentMethod: bookingData.paymentSimulation?.cardBrand,
    });

    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        userId: currentUser.id,
        title: '🎉 ¡Reserva confirmada con éxito!',
        message: `¡Excelente noticia! Tu solicitud para "${bookingData.space.title}" por CLP ${bookingData.totalClp.toLocaleString('es-CL')} ha sido registrada. Pago procesado mediante simulación Webpay Plus (Aut: ${bookingData.paymentSimulation?.authorizationCode || '748291'}). El contrato digital está firmado y notificado.`,
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ]);

    return { reservation: newReservation, contract };
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
      rating: 5.0,
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

  const quickVerifyUser = () => {
    if (!currentUser) return;
    const updated: UserProfile = {
      ...currentUser,
      verificationStatus: 'verified',
      kycData: {
        ...(currentUser.kycData || {
          consentGiven: true,
          termsVersion: 'VERIFICACION-2026.1',
          photoCaptured: true,
          idFrontCaptured: true,
          idBackCaptured: true,
          rutNumber: currentUser.rut,
          documentSerialNumber: '123456789',
          criminalRecordSubmitted: true,
        }),
        biometricScore: 99.4,
        isLivenessConfirmed: true,
      },
    };
    setCurrentUser(updated);
    setAllUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));

    if (isSupabaseConfigured()) {
      updateProfileInDb(updated.id, {
        verificationStatus: 'verified',
        kycData: updated.kycData,
      }).catch(console.warn);
    }

    addAuditRecord('QUICK_VERIFICATION_ACTIVATED', 'security', {
      userId: updated.id,
      status: 'verified',
      score: 99.4,
    });

    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        userId: updated.id,
        title: '✅ Identidad Verificada para Arriendos',
        message: 'Tu perfil ha sido verificado con éxito. Ya puedes formalizar reservas y contratos legales bajo la Ley 18.101.',
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ]);
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

  const deleteSpace = (id: string) => {
    setSpaces((prev) => prev.filter((spc) => spc.id !== id));

    if (isSupabaseConfigured()) {
      deleteSpaceFromDb(id).catch(console.warn);
    }

    addAuditRecord('SPACE_DELETED', 'warning', { spaceId: id });
  };

  // Actualización de estado de reserva (ej. Propietario acepta o rechaza solicitud de reserva)
  const updateReservationStatus = (reservationId: string, status: ReservationStatus) => {
    const targetReservation = reservations.find((r) => r.id === reservationId);

    if (status === 'confirmed' && targetReservation) {
      const todayStr = getTodayIso();
      const resDate = targetReservation.endDate || targetReservation.startDate;
      if (resDate < todayStr) {
        throw new Error('No es posible aprobar una reserva cuya fecha ya transcurrió.');
      }
    }

    setReservations((prev) =>
      prev.map((res) => (res.id === reservationId ? { ...res, status } : res))
    );

    if (isSupabaseConfigured()) {
      updateReservationInDb(reservationId, { status }).catch(console.warn);
    }

    addAuditRecord('RESERVATION_STATUS_CHANGED', 'info', {
      reservationId,
      newStatus: status,
      actionBy: currentUser ? currentUser.id : 'system',
      actionByRole: currentUser ? currentUser.role : 'admin',
    });

    if (currentUser) {
      setNotifications((prev) => [
        {
          id: `notif-${Date.now()}`,
          userId: currentUser.id,
          title: `Reserva ${status === 'confirmed' ? 'Aceptada' : status === 'rejected' ? 'Rechazada' : status}`,
          message: `La reserva #${reservationId.slice(-6)} ha sido actualizada a ${status}.`,
          type: status === 'confirmed' ? 'success' : 'warning',
          timestamp: new Date().toISOString(),
          read: false,
        },
        ...prev,
      ]);
    }

    if (status === 'rejected' && targetReservation) {
      setNotifications((prev) => [
        {
          id: `notif-refund-${Date.now()}`,
          userId: targetReservation.tenantId,
          title: 'Reserva Rechazada y Reembolso Iniciado',
          message: `El propietario ha rechazado la reserva #${reservationId.slice(-6)}. Se ha iniciado el reembolso total de tu pago a tu método original.`,
          type: 'warning',
          timestamp: new Date().toISOString(),
          read: false,
        },
        ...prev,
      ]);
      
      setNotifications((prev) => [
        {
          id: `notif-owner-refund-${Date.now()}`,
          userId: targetReservation.ownerId,
          title: 'Contrato Rechazado',
          message: `Has rechazado el contrato de la reserva #${reservationId.slice(-6)}. Se devolverá el dinero íntegramente al arrendatario.`,
          type: 'info',
          timestamp: new Date().toISOString(),
          read: false,
        },
        ...prev,
      ]);
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
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
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
        notifications,
        savedCards,
        visitRequests,
        requestVisit,
        quickVerifyUser,
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
        createSpace,
        updateSpace,
        deleteSpace,
        updateReservationStatus,
        adminApproveKyc,
        adminRejectKyc,
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
