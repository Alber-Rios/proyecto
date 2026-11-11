import { TabPanel } from '../components/motion/Motion.tsx';
import { cancelledByOf, isHistoryCancellation } from '../lib/cancellations.ts';
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { OwnerEarningsPanel } from '../components/dashboard/OwnerEarningsPanel.tsx';
import { Space, Reservation, DigitalContract, VisitRequest, ReservationStatus } from '../types.ts';
import { useApp } from '../context/AppContext.tsx';
import { formatClp, formatHourRange, formatRut, formatUnits, getSpaceRateInfo, getTodayIso } from '../utils/formatters.ts';
import { useChileNow } from '../hooks/useChileNow.ts';
import { expiryLabel, isActionableRequest, isExpiredRequest, isExpiringSoon } from '../utils/requestExpiry.ts';
import { ContractModal } from '../components/ContractModal.tsx';
import { PublishSpaceForm, SpaceFormData } from '../components/PublishSpaceForm.tsx';
import { SpaceAvailabilityViewer } from '../components/SpaceAvailabilityViewer.tsx';
import { SpaceBlockModal } from '../components/SpaceBlockModal.tsx';
import { OwnerOverview } from '../components/dashboard/OwnerOverview.tsx';
import { DashboardShell } from '../components/dashboard/DashboardShell.tsx';
import { OwnerCommissionNote } from '../components/dashboard/OwnerCommissionNote.tsx';
import { blocksOnDay, describeBlock } from '../utils/spaceBlocks.ts';
import { ContactTenantModal, ContactTenant } from '../components/ContactTenantModal.tsx';
import {
  downloadContractDocument,
  downloadReservationDocument,
} from '../utils/documentDownloader.ts';
import {
  Building,
  LayoutDashboard,
  Wallet,
  Search,
  Heart,
  UserCheck,
  HelpCircle,
  PlusCircle,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Download,
  Banknote,
  TrendingUp,
  Calendar,
  AlertTriangle,
  MapPin,
  Users,
  ShieldCheck,
  Eye,
  Trash2,
  Upload,
  Image as ImageIcon,
  Sun,
  Umbrella,
  Check,
  Layers,
  Camera,
  Pencil,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Settings,
  Wrench,
  MessageSquare,
  Phone,
  ExternalLink,
  Filter,
  Info,
  Calendar as CalendarIcon,
  X,
  Lock,
  Building2,
  Loader2,
} from 'lucide-react';

interface OwnerDashboardPageProps {
  onOpenOwnerUpgrade: () => void;
  onNavigate: (view: string) => void;
  onOpenAuth?: (mode: 'login' | 'register', notice?: string) => void;
}


// Presets removidos por solicitud del usuario

export const OwnerDashboardPage: React.FC<OwnerDashboardPageProps> = ({ onOpenOwnerUpgrade, onNavigate, onOpenAuth }) => {
  const {
    currentUser,
    spaces,
    reservations,
    contracts,
    createSpace,
    updateSpace,
    deleteSpace,
    updateReservationStatus,
    cancelReservation,
    visitRequests,
    spaceBlocks,
    addSpaceBlock,
    removeSpaceBlock,
  } = useApp();
  // Bloqueos de disponibilidad guardados en la base (space_blocks).
  const maintenanceBlocks = spaceBlocks;

  const [activeTab, setActiveTab] = useState<'overview' | 'spaces' | 'bookings' | 'finances' | 'calendar' | 'visits'>('overview');
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);
  const [selectedContract, setSelectedContract] = useState<DigitalContract | null>(null);

  // Estados para selector de espacio y calendario interactivo
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>('');
  const [currentCalendarDate, setCurrentCalendarDate] = useState<Date>(() => new Date());
  const [calendarViewMode, setCalendarViewMode] = useState<'month' | 'week' | 'list'>('month');
  const [pendingFilter, setPendingFilter] = useState<'all' | 'selected'>('all');
  const [bookingListStatusFilter, setBookingListStatusFilter] = useState<'pending_valid' | 'all' | 'confirmed' | 'past' | 'cancelled'>('pending_valid');
  const [cancelledByFilter, setCancelledByFilter] = useState<'all' | 'tenant' | 'owner'>('all');
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [maintenanceDate, setMaintenanceDate] = useState(() => getTodayIso());
  const [spaceToDelete, setSpaceToDelete] = useState<Space | null>(null);
  const [isDeletingSpace, setIsDeletingSpace] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [dashboardNotice, setDashboardNotice] = useState<string | null>(null);
  const [contactModalTenant, setContactModalTenant] = useState<ContactTenant | null>(null);
  const [selectedDayInfo, setSelectedDayInfo] = useState<{ date: string; dayNumber: number } | null>(null);
  const [ownerSelectedDate, setOwnerSelectedDate] = useState<string>(() => getTodayIso());
  const location = useLocation();
  const routerNavigate = useNavigate();

  // Al llegar desde un botón "Publicar", se abre el formulario de inmediato.
  useEffect(() => {
    const state = location.state as { openPublish?: boolean } | null;
    if (!state?.openPublish || !currentUser) return;
    routerNavigate(location.pathname, { replace: true, state: null });
    if (currentUser.verificationStatus !== 'verified') {
      onNavigate('onboarding');
      return;
    }
    setEditingSpace(null);
    setIsPublishModalOpen(true);
  }, [location.state, location.pathname, currentUser, routerNavigate, onNavigate]);

  // Con el formulario abierto, la página de fondo no se desplaza.
  useEffect(() => {
    if (!isPublishModalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isPublishModalOpen]);

  // CASO 1: Usuario No Registrado / No Autenticado
  if (!currentUser) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-lg space-y-6">
          <div className="w-16 h-16 bg-rose-600 text-white rounded-3xl flex items-center justify-center mx-auto shadow-md">
            <Building className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Publica y administra tus espacios
            </h2>
            <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
              Arrienda tu oficina, sala, bodega o local por hora, día o mes. Spotly cobra por ti y genera el contrato.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => onOpenAuth?.('login', 'Inicia sesión para administrar tus espacios.')}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => onOpenAuth?.('register', 'Crea tu cuenta para empezar a publicar.')}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
            >
              Crear cuenta
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Si es administrador, avisar que esta vista es exclusiva de propietarios
  if (currentUser.role === 'admin') {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center shadow-sm space-y-5">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-slate-900">Estás como administrador</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Las cuentas de administración no publican ni arriendan espacios. Usa el panel de administración.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // REGLA CRÍTICA DE ACCESO: Si es arrendatario sin términos aceptados, no puede ver el panel de propietario
  if (currentUser.role === 'tenant' && !currentUser.ownerTermsAccepted) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-lg space-y-6">
          <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
              Tu cuenta es de arrendatario
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Activa tu perfil de anfitrión para publicar
            </h2>
            <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
              Para publicar espacios y recibir pagos tienes que aceptar el Acuerdo de Anfitriones. Puedes seguir arrendando como siempre.
            </p>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={onOpenOwnerUpgrade}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-rose-600 hover:from-rose-700 hover:to-amber-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
            >
              Aceptar y activar perfil de anfitrión
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Espacios que pertenecen a este propietario
  const mySpaces = useMemo(() => {
    return spaces.filter((s) => s.ownerId === currentUser.id);
  }, [spaces, currentUser.id]);

  // Fecha de referencia actual del sistema
  const chileNow = useChileNow();
  const todayIso = useMemo(() => getTodayIso(), []);

  // Reservas recibidas para las propiedades de este propietario
  const myReceivedBookings = useMemo(() => {
    // Las reservas que se anularon solas porque el pago falló (saldo
    // insuficiente, tarjeta rechazada) no son parte del historial.
    return reservations.filter(
      (r) => r.ownerId === currentUser.id && (r.status !== 'cancelled' || isHistoryCancellation(r))
    );
  }, [reservations, currentUser.id]);

  const cancelledReceived = useMemo(
    () => myReceivedBookings.filter((r) => r.status === 'cancelled'),
    [myReceivedBookings]
  );
  const cancelledCounts = useMemo(() => {
    const c = { tenant: 0, owner: 0, admin: 0 };
    cancelledReceived.forEach((r) => {
      c[cancelledByOf(r)] += 1;
    });
    return c;
  }, [cancelledReceived]);

  // Solicitudes pendientes válidas para aprobar (del día actual hacia adelante)
  const pendingValidBookings = useMemo(() => {
    // Vence al llegar su hora de inicio: después ya no se puede aprobar.
    return myReceivedBookings.filter((b) => isActionableRequest(b, chileNow));
  }, [myReceivedBookings, chileNow]);

  // La solicitud que vence primero (para el aviso de arriba).
  const nextPendingRequest = useMemo(
    () =>
      [...pendingValidBookings].sort(
        (a, b) => a.startDate.localeCompare(b.startDate) || (a.hourStart ?? 0) - (b.hourStart ?? 0)
      )[0] ?? null,
    [pendingValidBookings]
  );

  // Visitas técnicas vigentes (solo desde hoy en adelante; si ya pasó el día de la visita ya no aparece)
  const upcomingVisitRequests = useMemo(() => {
    return visitRequests.filter(
      (v) => v.ownerId === currentUser.id && v.visitDate >= todayIso && v.status !== 'cancelled'
    );
  }, [visitRequests, currentUser.id, todayIso]);

  // Ganancias reales del propietario y desglose real por cada lugar
  const financialMetrics = useMemo(() => {
    let grossIncome = 0;
    let platformFeesPaid = 0;
    let depositsHeld = 0;
    let confirmedCount = 0;
    let totalBookedUnits = 0;

    const bySpace: Record<
      string,
      {
        spaceId: string;
        spaceTitle: string;
        commune: string;
        status: Space['status'];
        grossIncome: number;
        platformFeesPaid: number;
        netPayout: number;
        depositsHeld: number;
        confirmedCount: number;
        pendingCount: number;
        bookedDaysOrBlocks: number;
        occupancyPct: number;
      }
    > = {};

    mySpaces.forEach((sp) => {
      bySpace[sp.id] = {
        spaceId: sp.id,
        spaceTitle: sp.title,
        commune: sp.commune,
        status: sp.status,
        grossIncome: 0,
        platformFeesPaid: 0,
        netPayout: 0,
        depositsHeld: 0,
        confirmedCount: 0,
        pendingCount: 0,
        bookedDaysOrBlocks: 0,
        occupancyPct: 0,
      };
    });

    myReceivedBookings.forEach((b) => {
      // Comisión del anfitrión (el 5 % del arrendatario no se le descuenta).
      const fee = b.ownerCommissionClp || 0;
      if (isActionableRequest(b, chileNow)) {
        if (bySpace[b.spaceId]) {
          bySpace[b.spaceId].pendingCount += 1;
        }
      }
      if (b.status === 'confirmed' || b.status === 'completed') {
        grossIncome += b.subtotalClp;
        platformFeesPaid += fee;
        depositsHeld += b.securityDepositClp || 0;
        confirmedCount++;
        const daysUsed = Math.max(1, b.totalDays || 1);
        totalBookedUnits += daysUsed;

        if (bySpace[b.spaceId]) {
          bySpace[b.spaceId].grossIncome += b.subtotalClp;
          bySpace[b.spaceId].platformFeesPaid += fee;
          bySpace[b.spaceId].netPayout += b.subtotalClp - fee;
          bySpace[b.spaceId].depositsHeld += b.securityDepositClp || 0;
          bySpace[b.spaceId].confirmedCount += 1;
          bySpace[b.spaceId].bookedDaysOrBlocks += daysUsed;
        }
      }
    });

    Object.values(bySpace).forEach((item) => {
      // Ocupación real sobre base de 20 jornadas hábiles mensuales por recinto
      item.occupancyPct = Math.min(100, Math.round((item.bookedDaysOrBlocks / 20) * 100));
    });

    const activeSpacesCount = mySpaces.filter((s) => s.status === 'active').length;
    const pendingSpacesCount = mySpaces.filter((s) => s.status === 'pending_approval').length;
    const operationalPct =
      mySpaces.length > 0 ? Math.round((activeSpacesCount / mySpaces.length) * 100) : 0;

    const totalAvailableDays = Math.max(1, activeSpacesCount * 20);
    const realOccupancyPct = Math.min(
      100,
      Math.round((totalBookedUnits / totalAvailableDays) * 100)
    );

    const netPayout = grossIncome - platformFeesPaid;
    return {
      grossIncome,
      platformFeesPaid,
      depositsHeld,
      netPayout,
      confirmedCount,
      totalBookedUnits,
      activeSpacesCount,
      pendingSpacesCount,
      operationalPct,
      realOccupancyPct,
      bySpace,
      spaceBreakdownList: Object.values(bySpace),
    };
  }, [myReceivedBookings, mySpaces, todayIso]);

  const handleStartEdit = (space: Space) => {
    if (currentUser.verificationStatus !== 'verified') {
      onNavigate('onboarding');
      return;
    }
    setEditingSpace(space);
    setIsPublishModalOpen(true);
  };

  const resetForm = () => {
    setEditingSpace(null);
  };

  // Cancelación de una reserva confirmada por el propietario: la base registra el
  // motivo y devuelve el 100 % de lo pagado al arrendatario.
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const submitOwnerCancel = async () => {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 5) {
      setCancelError('Escribe el motivo de la cancelación para el arrendatario.');
      return;
    }
    setCancelBusy(true);
    setCancelError(null);
    try {
      await cancelReservation(cancelTarget.id, cancelReason.trim());
      setCancelTarget(null);
      setCancelReason('');
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'No se pudo cancelar la reserva.');
    } finally {
      setCancelBusy(false);
    }
  };

  // La base valida la transición (p. ej., no se acepta sin pago aprobado) y calcula reembolsos.
  const changeReservationStatus = (reservationId: string, status: ReservationStatus) => {
    updateReservationStatus(reservationId, status).catch((err) =>
      alert(err instanceof Error ? err.message : 'No se pudo actualizar la reserva.')
    );
  };

  const handleOpenPublishModal = () => {
    if (currentUser.verificationStatus !== 'verified') {
      onNavigate('onboarding');
      return;
    }
    setIsPublishModalOpen(true);
  };

  const handleNavigateToBookingInCalendar = (booking: Reservation) => {
    setSelectedSpaceId(booking.spaceId);
    setOwnerSelectedDate(booking.startDate);
    setActiveTab('calendar');
    setTimeout(() => {
      const el = document.getElementById('calendario-disponibilidad');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
  };

  const handleSubmitSpace = (data: SpaceFormData) => {
    if (currentUser.verificationStatus !== 'verified') {
      onNavigate('onboarding');
      return;
    }

    if (editingSpace) {
      const { status: _status, isVerified: _verified, ...changes } = data;
      updateSpace(editingSpace.id, changes);
      alert('Cambios guardados.');
    } else {
      createSpace({ ...data, status: 'pending_approval', isVerified: false });
      alert('¡Publicación enviada! Tu espacio quedó en revisión y aparecerá en el catálogo cuando administración lo apruebe.');
    }

    resetForm();
    setIsPublishModalOpen(false);
  };

  // Selección de espacio activo para el panel y calendario
  const selectedSpace = useMemo(() => {
    if (mySpaces.length === 0) return null;
    const found = mySpaces.find((s) => s.id === selectedSpaceId);
    return found || mySpaces[0];
  }, [mySpaces, selectedSpaceId]);

  // Visualizador de Contrato Digital Inteligente (encuentra o genera al instante con Ley 18.101 & 19.799)
  const handleViewReservationContract = (reservation: Reservation) => {
    const existing = contracts.find(
      (c) => c.id === reservation.digitalContractId || c.reservationId === reservation.id
    );
    if (existing) {
      setSelectedContract(existing);
      return;
    }

    alert('Esta reserva no tiene un contrato firmado registrado. Los contratos se generan y firman al momento de reservar.');
  };

  const handleViewContract = (contractId?: string) => {
    const contract = contracts.find((c) => c.id === contractId);
    if (contract) {
      setSelectedContract(contract);
    } else {
      alert('Contrato digital no encontrado para esta reserva.');
    }
  };

  // Cálculo de días del mes para el calendario dinámico
  const calendarGridDays = useMemo(() => {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    // En Chile (calendario estándar) la semana empieza en Lunes (0 = Lun, ..., 6 = Dom)
    const startingDayIndex = (firstDayOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: ({
      dayNumber: number;
      dateString: string;
      isCurrentMonth: boolean;
    } | null)[] = [];

    // Celdas vacías antes del 1er día
    for (let i = 0; i < startingDayIndex; i++) {
      days.push(null);
    }

    // Días del mes
    for (let day = 1; day <= daysInMonth; day++) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      days.push({
        dayNumber: day,
        dateString: `${year}-${mStr}-${dStr}`,
        isCurrentMonth: true,
      });
    }

    return days;
  }, [currentCalendarDate]);

  // Consulta de eventos en una fecha para el recinto seleccionado
  const getDayEventsForSelectedSpace = (dateString: string) => {
    if (!selectedSpace) return { booking: null, visit: null, maintenance: null };

    const booking = myReceivedBookings.find(
      (b) => b.spaceId === selectedSpace.id && b.startDate <= dateString && b.endDate >= dateString
    );
    const visit = upcomingVisitRequests.find(
      (v) => v.spaceId === selectedSpace.id && v.visitDate === dateString
    );
    const maintenance = blocksOnDay(maintenanceBlocks, selectedSpace.id, dateString)[0] || null;

    return { booking, visit, maintenance };
  };

  // Leyenda de tarifa dinámica para el recinto seleccionado
  const spaceLegendRate = useMemo(() => {
    if (!selectedSpace) return 'Disponible';
    if (selectedSpace.pricePerHour) return `Disponible · ${formatClp(selectedSpace.pricePerHour)} la hora`;
    if (selectedSpace.pricePerMonth) return `Disponible · ${formatClp(selectedSpace.pricePerMonth)} al mes`;
    if (selectedSpace.pricePerDay) return `Disponible · ${formatClp(selectedSpace.pricePerDay)} el día`;
    return 'Disponible';
  }, [selectedSpace]);

  const spaceModalityLabel = useMemo(() => {
    if (!selectedSpace) return 'Sin modalidad';
    if (selectedSpace.rentalModality === 'abierto') return 'Por hora y por día';
    if (selectedSpace.rentalModality === 'por_hora') return 'Por hora';
    if (selectedSpace.rentalModality === 'mensual') return 'Mensual';
    return 'Por día';
  }, [selectedSpace]);

  const handlePrevMonth = () => {
    setCurrentCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleResetToCurrentMonth = () => {
    setCurrentCalendarDate(new Date(2026, 8, 1)); // Septiembre 2026 (mes del mockup)
  };

  const handleRemoveMaintenanceBlock = async (id: string) => {
    const result = await removeSpaceBlock(id);
    if (!result.success) alert(result.message || 'No se pudo quitar el bloqueo.');
  };

  const handleConfirmDeleteSpace = async () => {
    if (!spaceToDelete) return;
    setIsDeletingSpace(true);
    setDeleteError(null);
    const result = await deleteSpace(spaceToDelete.id);
    setIsDeletingSpace(false);
    if (!result.success) {
      setDeleteError(result.message);
      return;
    }
    if (selectedSpaceId === spaceToDelete.id) setSelectedSpaceId('');
    setSpaceToDelete(null);
    setDashboardNotice(result.message);
    window.setTimeout(() => setDashboardNotice(null), 6000);
  };

  return (
    <div className="pb-16">
      <DashboardShell
        area="Mis espacios"
        storageKey="spotly-owner-menu-collapsed"
        active={activeTab}
        onSelect={(id) => setActiveTab(id as typeof activeTab)}
        primaryAction={{ id: 'owner-publish-space-btn', label: 'Publicar espacio', icon: PlusCircle, onClick: handleOpenPublishModal }}
        footer={
          <OwnerCommissionNote
            acceptedBookings={myReceivedBookings.filter((b) => b.status === 'confirmed' || b.status === 'completed').length}
            onOpen={() => setActiveTab('finances')}
          />
        }
        onNavigate={onNavigate}
        sections={[
          {
            label: 'Mi negocio',
            items: [
              { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
              { id: 'calendar', label: 'Calendario', icon: Calendar },
              { id: 'spaces', label: 'Mis espacios', icon: Building, count: mySpaces.length },
              { id: 'bookings', label: 'Reservas recibidas', icon: Clock, badge: pendingValidBookings.length || undefined, count: myReceivedBookings.length },
              { id: 'visits', label: 'Visitas', icon: MapPin, count: upcomingVisitRequests.length },
            ],
          },
          {
            label: 'Dinero',
            items: [
              { id: 'finances', label: 'Ganancias', icon: TrendingUp },
              { id: 'go-wallet', label: 'Billetera', icon: Wallet, action: () => onNavigate('wallet') },
            ],
          },
          {
            label: 'Arrendar',
            items: [
              { id: 'go-explore', label: 'Explorar espacios', icon: Search, action: () => onNavigate('home') },
              { id: 'go-bookings', label: 'Mis reservas', icon: FileText, action: () => onNavigate('my-bookings') },
              { id: 'go-favorites', label: 'Mis favoritos', icon: Heart, action: () => onNavigate('favorites') },
            ],
          },
          {
            label: 'Cuenta',
            items: [
              {
                id: 'go-kyc',
                label: 'Verificación',
                icon: UserCheck,
                action: () => onNavigate('onboarding'),
                chip:
                  currentUser.verificationStatus === 'verified'
                    ? { label: 'Al día', tone: 'ok' }
                    : currentUser.verificationStatus === 'rejected'
                      ? { label: 'Rechazada', tone: 'bad' }
                      : currentUser.verificationStatus === 'pending_review'
                        ? { label: 'En revisión', tone: 'warn' }
                        : { label: 'Pendiente', tone: 'warn' },
              },
              { id: 'go-support', label: 'Ayuda y soporte', icon: HelpCircle, action: () => onNavigate('support') },
            ],
          },
        ]}
      >
      <div className="space-y-6">
      {currentUser.verificationStatus !== 'verified' && (
        <p role="status" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Tu identidad está en revisión. Puedes preparar tus espacios mientras tanto.
        </p>
      )}

      {nextPendingRequest && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3 min-w-0">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-950">
                {pendingValidBookings.length === 1
                  ? 'Tienes 1 solicitud por responder'
                  : `Tienes ${pendingValidBookings.length} solicitudes por responder`}
              </p>
              <p className="text-sm text-amber-900">
                {nextPendingRequest.tenantName} · {nextPendingRequest.spaceTitle} ·{' '}
                {expiryLabel(nextPendingRequest, chileNow).toLowerCase()}. Si no respondes, se rechaza sola.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab('calendar');
              handleNavigateToBookingInCalendar(nextPendingRequest);
            }}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-amber-900 px-4 text-sm font-semibold text-white transition hover:bg-amber-950 cursor-pointer"
          >
            Revisar
          </button>
        </div>
      )}

      {dashboardNotice && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800" role="status">
          <span>{dashboardNotice}</span>
          <button type="button" onClick={() => setDashboardNotice(null)} className="p-1 rounded-lg hover:bg-emerald-100 cursor-pointer" aria-label="Cerrar aviso">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <TabPanel tabKey={activeTab} className="space-y-8">
      {/* Contenido según Pestaña */}
      {activeTab === 'overview' && (
        <OwnerOverview
          todayIso={todayIso}
          spaces={mySpaces}
          bookings={myReceivedBookings}
          pendingBookings={pendingValidBookings}
          upcomingVisits={upcomingVisitRequests}
          blocks={maintenanceBlocks}
          onGoTab={(tab) => setActiveTab(tab)}
          onOpenCalendar={(spaceId, dateIso) => {
            setSelectedSpaceId(spaceId);
            setOwnerSelectedDate(dateIso);
            setActiveTab('calendar');
          }}
        />
      )}

      {activeTab === 'spaces' && (
        <div className="space-y-4">
          {mySpaces.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
              <Building className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">Aún no has publicado ningún espacio</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Publica tu primera oficina, sala o bodega para empezar a recibir reservas.
              </p>
              <button
                onClick={handleOpenPublishModal}
                className="mt-2 px-5 py-2.5 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700 transition inline-flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" /> Publicar mi primer espacio
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {mySpaces.map((space) => (
                <div
                  key={space.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between"
                >
                  <div className="relative aspect-16/10 bg-slate-100 overflow-hidden">
                    <img
                      src={space.images[0]}
                      alt={space.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          space.status === 'active'
                            ? 'bg-emerald-500 text-white'
                            : space.status === 'pending_approval'
                            ? 'bg-amber-500 text-white'
                            : 'bg-slate-500 text-white'
                        }`}
                      >
                        {space.status === 'active'
                          ? 'Activo'
                          : space.status === 'pending_approval'
                          ? 'En revisión'
                          : 'Pausado'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between min-w-0">
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="truncate">{space.commune}</span>
                        </span>
                        <span className="text-xs text-slate-500 font-medium whitespace-nowrap shrink-0">
                          {space.capacity} pers · {space.surfaceM2} m²
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 mt-1 line-clamp-1">
                        {space.title}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                        {space.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        {(() => {
                          const rate = getSpaceRateInfo(space);
                          return (
                            <div className="truncate">
                              <span className="font-bold text-slate-900 text-sm">
                                {formatClp(rate.amount)}
                              </span>
                              <span className="text-slate-500 font-medium"> {rate.unitLabel}</span>
                            </div>
                          );
                        })()}
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                          Garantía: <strong className="text-slate-700">{space.securityDeposit && space.securityDeposit > 0 ? formatClp(space.securityDeposit) : 'No pide'}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => {
                            setSelectedSpaceId(space.id);
                            setActiveTab('calendar');
                          }}
                          className="flex-1 min-w-[115px] px-2.5 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
                          title="Gestionar disponibilidad y solicitudes de este recinto en el calendario"
                        >
                          <Calendar className="w-3 h-3 text-indigo-600 shrink-0" />
                          <span>Calendario</span>
                        </button>
                        <button
                          onClick={() => handleStartEdit(space)}
                          className="flex-1 min-w-[95px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
                          title="Modificar precio, descripción y datos del espacio"
                        >
                          <Pencil className="w-3 h-3 text-slate-600 shrink-0" />
                          <span>Modificar</span>
                        </button>
                        <button
                          onClick={() =>
                            updateSpace(space.id, {
                              status: space.status === 'active' ? 'paused' : 'active',
                            })
                          }
                          className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs cursor-pointer whitespace-nowrap"
                        >
                          {space.status === 'active' ? 'Pausar' : 'Activar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setSpaceToDelete(space);
                          }}
                          className="px-2.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                          title="Eliminar esta publicación"
                        >
                          <Trash2 className="w-3 h-3 shrink-0" />
                          <span>Eliminar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pestaña: Solicitudes y Reservas Recibidas */}
      {activeTab === 'bookings' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Reservas y solicitudes
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Aprobación: Hoy ({todayIso}) en adelante
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Quién arrienda, qué espacio, cuándo y su contrato.
              </p>
            </div>

            {/* Selector para filtrar reservas por recinto específico */}
            <div className="flex items-center gap-2">
              <label htmlFor="filter-bookings-space" className="text-xs font-bold text-slate-500 whitespace-nowrap">
                Espacio:
              </label>
              <select
                id="filter-bookings-space"
                value={selectedSpaceId || ''}
                onChange={(e) => setSelectedSpaceId(e.target.value)}
                className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
              >
                <option value="">Todos mis recintos ({mySpaces.length})</option>
                {mySpaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.commune})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Barra de filtros de estado: Por Aprobar (Vigentes), Todas, Confirmadas, Expiradas/Pasadas */}
          <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2 overflow-x-auto">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap mr-1">Estado:</span>
            <button
              type="button"
              onClick={() => setBookingListStatusFilter('pending_valid')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                bookingListStatusFilter === 'pending_valid'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Por Aprobar ({pendingValidBookings.length})
            </button>
            <button
              type="button"
              onClick={() => setBookingListStatusFilter('all')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                bookingListStatusFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Todas ({myReceivedBookings.length})
            </button>
            <button
              type="button"
              onClick={() => setBookingListStatusFilter('confirmed')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                bookingListStatusFilter === 'confirmed'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Confirmadas ({myReceivedBookings.filter((b) => b.status === 'confirmed').length})
            </button>
            <button
              type="button"
              onClick={() => setBookingListStatusFilter('past')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                bookingListStatusFilter === 'past'
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Pasadas / Expiradas ({myReceivedBookings.filter((b) => b.startDate < todayIso && b.status !== 'cancelled').length})
            </button>
            <button
              type="button"
              onClick={() => setBookingListStatusFilter('cancelled')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                bookingListStatusFilter === 'cancelled'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Canceladas ({cancelledReceived.length})
            </button>
          </div>

          {bookingListStatusFilter === 'cancelled' && (
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 overflow-x-auto" role="group" aria-label="Quién canceló">
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap mr-1">Cancelada por:</span>
              {([
                ['all', `Todas (${cancelledReceived.length})`],
                ['tenant', `El arrendatario (${cancelledCounts.tenant})`],
                ['owner', `Ti (${cancelledCounts.owner + cancelledCounts.admin})`],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={cancelledByFilter === value}
                  onClick={() => setCancelledByFilter(value)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                    cancelledByFilter === value
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {(() => {
            let displayedBookings = selectedSpaceId
              ? myReceivedBookings.filter((b) => b.spaceId === selectedSpaceId)
              : myReceivedBookings;

            if (bookingListStatusFilter === 'pending_valid') {
              displayedBookings = displayedBookings.filter((b) => isActionableRequest(b, chileNow));
            } else if (bookingListStatusFilter === 'confirmed') {
              displayedBookings = displayedBookings.filter((b) => b.status === 'confirmed');
            } else if (bookingListStatusFilter === 'past') {
              displayedBookings = displayedBookings.filter((b) => b.startDate < todayIso && b.status !== 'cancelled');
            } else if (bookingListStatusFilter === 'cancelled') {
              displayedBookings = displayedBookings
                .filter((b) => b.status === 'cancelled')
                .filter((b) => {
                  if (cancelledByFilter === 'all') return true;
                  const by = cancelledByOf(b);
                  return cancelledByFilter === 'tenant' ? by === 'tenant' : by !== 'tenant';
                })
                .sort((a, b) => (b.cancelledAt || b.startDate).localeCompare(a.cancelledAt || a.startDate));
            }

            if (displayedBookings.length === 0) {
              return (
                <div className="p-12 text-center text-slate-500 text-xs">
                  <Clock className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  No hay reservas con este filtro.
                </div>
              );
            }

            return (
              <div className="divide-y divide-slate-100">
                {displayedBookings.map((res) => {
                  const isExpired = isExpiredRequest(res, chileNow);
                  const isPast = res.startDate < todayIso || isExpired;
                  const canApprove = isActionableRequest(res, chileNow);

                  return (
                    <div key={res.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 transition">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-500">#{res.id.slice(-6)}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              res.status === 'confirmed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : res.status === 'pending'
                                ? isPast
                                  ? 'bg-slate-100 text-slate-700 border border-slate-300'
                                  : 'bg-amber-100 text-amber-800'
                                : res.status === 'cancelled'
                                ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {res.status === 'confirmed'
                              ? 'Confirmada'
                              : res.status === 'pending'
                              ? isPast
                                ? 'Vencida sin respuesta · se devuelve el 100 %'
                                : `Esperando tu respuesta · ${expiryLabel(res, chileNow).toLowerCase()}`
                              : res.status === 'cancelled'
                              ? cancelledByOf(res) === 'tenant'
                                ? 'Cancelada por el arrendatario'
                                : cancelledByOf(res) === 'owner'
                                ? 'Cancelada por ti'
                                : 'Cancelada por administración'
                              : res.status === 'completed'
                              ? 'Finalizada'
                              : 'Rechazada'}
                          </span>

                          {/* Etiqueta explícita del recinto solicitado */}
                          <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1">
                            <Building className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{res.spaceTitle}</span>
                          </span>

                          {isPast && (
                            <span className="text-xs text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded">
                              Ya pasó
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span>Cliente: <strong className="text-slate-900">{res.tenantName}</strong></span>
                          <span>RUT: <strong className="text-slate-900">{formatRut(res.tenantRut)}</strong></span>
                          <span>
                            Fechas: <strong>{res.startDate}</strong> al <strong>{res.endDate}</strong> ({res.durationUnits ? `${res.durationUnits} hrs` : `${res.totalDays} días`})
                          </span>
                          <span>Para ti: <strong className="text-emerald-700 font-bold">{formatClp(res.subtotalClp)}</strong></span>
                          {res.intendedUse && (
                            <span className="w-full text-slate-500 italic mt-0.5">
                              Uso previsto: "{res.intendedUse}"
                            </span>
                          )}
                          {res.status === 'cancelled' && (
                            <span className="w-full text-slate-600 mt-0.5">
                              {res.cancelledAt && <>Cancelada el <strong>{res.cancelledAt.slice(0, 10)}</strong> · </>}
                              {res.cancellationReason && <>Motivo: <strong>{res.cancellationReason}</strong></>}
                              {res.refundAmountClp !== undefined && res.refundAmountClp > 0 && (
                                <> · Reembolso al arrendatario: <strong>{formatClp(res.refundAmountClp)}</strong></>
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <button
                          onClick={() => downloadReservationDocument(res)}
                          className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                          title="Descargar comprobante de reserva"
                        >
                          <Download className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Descargar reserva</span>
                        </button>

                        {/* Botón para ver el contrato legal digital siempre accesible */}
                        <button
                          onClick={() => handleViewReservationContract(res)}
                          className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                          title="Ver y revisar el contrato legal digital (Ley 18.101 & 19.799)"
                        >
                          <FileText className="w-4 h-4 text-rose-600" />
                          <span>Ver contrato</span>
                        </button>

                        <button
                          onClick={() => {
                            const existing = contracts.find(
                              (c) => c.id === res.digitalContractId || c.reservationId === res.id
                            );
                            if (existing) {
                              downloadContractDocument(existing);
                              return;
                            }
alert('Esta reserva no tiene un contrato firmado registrado. Los contratos se generan y firman al momento de reservar.');
                          }}
                          className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                          title="Descargar contrato digital"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Descargar contrato</span>
                        </button>

                        <button
                          onClick={() => setContactModalTenant({
                            name: res.tenantName,
                            phone: '+56 9 8765 4321',
                            email: res.tenantEmail,
                            spaceTitle: res.spaceTitle,
                          })}
                          className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1 transition cursor-pointer"
                          title="Contactar al arrendatario"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                          <span>Contactar</span>
                        </button>

                        {res.status === 'pending' && (
                          <>
                            {canApprove ? (
                              <>
                                <button
                                  onClick={() => {
                                    if (!isActionableRequest(res, chileNow)) {
                                      alert('Esta solicitud venció: su hora de inicio ya pasó y se rechaza automáticamente con devolución del 100 %.');
                                      return;
                                    }
                                    changeReservationStatus(res.id, 'confirmed');
                                  }}
                                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 transition shadow-xs cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Aceptar</span>
                                </button>
                                <button
                                  onClick={() => {
                                    if (res.startDate < todayIso) {
                                      alert('Esta reserva ya pasó y no se puede modificar.');
                                      return;
                                    }
                                    changeReservationStatus(res.id, 'rejected');
                                  }}
                                  className="px-3.5 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Rechazar</span>
                                </button>
                              </>
                            ) : (
                              <span
                                className="px-3 py-2 rounded-xl bg-slate-100 text-slate-500 font-semibold text-xs border border-slate-200 cursor-not-allowed flex items-center gap-1.5"
                                title="Registro histórico: no se puede aprobar ni modificar una solicitud con fecha anterior a hoy"
                              >
                                <Lock className="w-3.5 h-3.5 text-slate-500" />
                                <span>Ya pasó</span>
                              </span>
                            )}
                          </>
                        )}

                        {res.status === 'confirmed' && (res.endDate || res.startDate) >= todayIso && (
                          <button
                            onClick={() => {
                              setCancelTarget(res);
                              setCancelReason('');
                              setCancelError(null);
                            }}
                            className="px-3.5 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Cancelar reserva</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Pestaña: Ganancias */}
      {activeTab === 'finances' && (
        <OwnerEarningsPanel reservations={myReceivedBookings} spaces={mySpaces} currentUser={currentUser} />
      )}

      {/* Pestaña: Calendario y Disponibilidad (Layout bien organizado y sin desbordes) */}
      {activeTab === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Columna Izquierda: Selector de Recinto, Navegación, Calendario Dinámico y Ficha (8 cols en desktop) */}
          <div className="lg:col-span-8 space-y-6 min-w-0">
            {/* Card de Gestión y Selector de Recinto */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xs overflow-hidden">
              {/* Fila 1: Etiquetas de estado del recinto */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <label htmlFor="owner-space-selector" className="text-xs font-bold text-slate-500">
                    Espacio
                  </label>
                  {selectedSpace && selectedSpace.status !== 'active' && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 whitespace-nowrap">
                      {selectedSpace.status === 'pending_approval' ? 'En revisión' : 'Pausado'}
                    </span>
                  )}
                </div>
                {selectedSpace && (
                  <span className="text-xs text-slate-500 font-medium truncate">
                    {[selectedSpace.address, selectedSpace.commune].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>

              {/* Fila 2: Selector desplegable acotado + Botones de acción alineados dentro del límite */}
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                <div className="relative min-w-0 flex-1">
                  <select
                    id="owner-space-selector"
                    value={selectedSpace?.id || ''}
                    onChange={(e) => setSelectedSpaceId(e.target.value)}
                    disabled={mySpaces.length === 0}
                    className="w-full truncate text-sm sm:text-base font-bold text-slate-900 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2.5 pr-9 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {mySpaces.length === 0 ? (
                      <option value="">Sin espacios publicados aún</option>
                    ) : (
                      mySpaces.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title} ({s.commune})
                        </option>
                      ))
                    )}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
                  {ownerSelectedDate < todayIso ? (
                    <span
                      className="flex-1 sm:flex-initial justify-center px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 font-bold text-xs flex items-center gap-1.5 cursor-not-allowed whitespace-nowrap"
                      title="Estás visualizando una fecha pasada. Solo puedes bloquear o modificar desde la fecha actual hacia adelante."
                    >
                      <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>Día pasado</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMaintenanceDate(ownerSelectedDate >= todayIso ? ownerSelectedDate : todayIso);
                        setIsMaintenanceModalOpen(true);
                      }}
                      className="flex-1 sm:flex-initial justify-center px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer whitespace-nowrap"
                    >
                      <Wrench className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Bloquear horario</span>
                    </button>
                  )}
                  {selectedSpace && (
                    <button
                      type="button"
                      onClick={() => handleStartEdit(selectedSpace)}
                      className="flex-1 sm:flex-initial justify-center px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer whitespace-nowrap"
                    >
                      <Pencil className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>Editar espacio</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Fila 3: Resumen compacto de características y tarifas del recinto */}
              {selectedSpace && (
                <div className="pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                  <p className="text-sm text-slate-600">
                    {[
                      spaceModalityLabel,
                      selectedSpace.pricePerHour ? `${formatClp(selectedSpace.pricePerHour)} la hora` : null,
                      selectedSpace.pricePerDay ? `${formatClp(selectedSpace.pricePerDay)} el día` : null,
                      selectedSpace.pricePerMonth ? `${formatClp(selectedSpace.pricePerMonth)} al mes` : null,
                      `${selectedSpace.capacity} personas`,
                      `${selectedSpace.surfaceM2} m²`,
                      selectedSpace.openingHours || null,
                      selectedSpace.securityDeposit && selectedSpace.securityDeposit > 0
                        ? `garantía ${formatClp(selectedSpace.securityDeposit)}`
                        : 'sin garantía',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <a
                    href={`/space/${selectedSpace.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 underline-offset-2 hover:underline"
                  >
                    Ver publicación
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </div>
              )}
            </div>

            {/* Componente Maestro de Disponibilidad Horaria en Modo Propietario (Permite ver horas pasadas y ocupaciones) */}
            {selectedSpace ? (
              <SpaceAvailabilityViewer
                space={selectedSpace}
                modality={
                  selectedSpace.rentalModality === 'mensual'
                    ? 'mensual'
                    : selectedSpace.rentalModality === 'por_hora'
                    ? 'por_hora'
                    : selectedSpace.rentalModality === 'por_dia'
                    ? 'por_dia'
                    : undefined
                }
                startDate={ownerSelectedDate}
                endDate={ownerSelectedDate}
                onSelectDateRange={(start) => setOwnerSelectedDate(start)}
                selectedHourStart={10}
                selectedHourEnd={14}
                isOwnerView={true}
                onViewContract={handleViewReservationContract}
                onContactTenant={(t) => setContactModalTenant(t)}
                onApproveReservation={(resId) => {
                  const targetRes = myReceivedBookings.find((r) => r.id === resId);
                  if (targetRes && targetRes.startDate < todayIso) {
                    alert('Esta reserva ya pasó y no se puede modificar.');
                    return;
                  }
                  changeReservationStatus(resId, 'confirmed');
                }}
                onBlockMaintenance={(date) => {
                  if (date < todayIso) {
                    alert(`No puedes bloquear fechas pasadas (${date}). Solo se permite bloquear o modificar desde hoy (${todayIso}) en adelante.`);
                    return;
                  }
                  setMaintenanceDate(date);
                  setIsMaintenanceModalOpen(true);
                }}
                maintenanceBlocks={maintenanceBlocks}
                onRemoveMaintenance={handleRemoveMaintenanceBlock}
              />
            ) : (
              <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-3 shadow-xs">
                <Building className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-900">
                  Aún no tienes espacios publicados
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Cuando publiques uno, aquí verás su calendario y sus reservas.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    handleOpenPublishModal();
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Publicar nuevo espacio</span>
                </button>
              </div>
            )}

          </div>

          {/* Columna Derecha: Solicitudes por Aprobar con identificación clara de recinto, Visitas Técnicas y Liquidaciones (4 cols en desktop) */}
          <div className="lg:col-span-4 space-y-6 min-w-0">
            {/* Card 1: Solicitudes por Aprobar */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-xs overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-900">
                      Solicitudes por aprobar{pendingValidBookings.length ? ` (${pendingValidBookings.length})` : ''}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Si no respondes antes de la hora de inicio, la solicitud se rechaza sola y se devuelve el 100 % al arrendatario.
                  </p>
                </div>
              </div>

              {/* Filtro rápido: Todas vs Solo del recinto seleccionado */}
              {selectedSpace && (
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-bold text-slate-600">
                  <button
                    onClick={() => setPendingFilter('all')}
                    className={`py-1.5 px-2 rounded-lg transition text-center cursor-pointer whitespace-nowrap ${
                      pendingFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'hover:text-slate-900'
                    }`}
                  >
                    Todas ({pendingValidBookings.length})
                  </button>
                  <button
                    onClick={() => setPendingFilter('selected')}
                    className={`py-1.5 px-2 rounded-lg transition text-center truncate cursor-pointer ${
                      pendingFilter === 'selected'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'hover:text-slate-900'
                    }`}
                    title={`Filtrar solo solicitudes para ${selectedSpace.title}`}
                  >
                    Solo este espacio
                  </button>
                </div>
              )}

              {/* Lista de Solicitudes */}
              <div className="space-y-3">
                {(() => {
                  const pendingList = pendingValidBookings;
                  const filteredPending = pendingFilter === 'selected' && selectedSpace
                    ? pendingList.filter(b => b.spaceId === selectedSpace.id)
                    : pendingList;

                  if (filteredPending.length === 0) {
                    return (
                      <div className="p-8 text-center text-slate-500 text-xs">
                        <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        No tienes solicitudes por responder.
                      </div>
                    );
                  }

                  return filteredPending.map((res) => (
                    <div
                      key={res.id}
                      onClick={() => handleNavigateToBookingInCalendar(res)}
                      className="p-4 rounded-2xl bg-slate-50/90 border border-slate-200 hover:border-indigo-300 hover:shadow-md hover:bg-indigo-50/20 transition space-y-3 cursor-pointer group overflow-hidden"
                      title="Haz clic para ver esta solicitud en el calendario de disponibilidad del recinto"
                    >
                      {/* DESTACADO CLAVE: Recinto al que postula + Badge */}
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold min-w-0 flex-1 group-hover:bg-indigo-600 group-hover:text-white transition">
                          <Building className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{res.spaceTitle}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 ${
                            isExpiringSoon(res, chileNow) ? 'bg-rose-100 text-rose-800' : 'bg-amber-50 text-amber-900'
                          }`}
                        >
                          {expiryLabel(res, chileNow)}
                        </span>
                      </div>

                      {/* Datos del Cliente */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0 group-hover:bg-indigo-900 transition">
                          {res.tenantName.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-slate-900 truncate">{res.tenantName}</h4>
                          <p className="text-xs text-slate-500 truncate">
                            RUT: {formatRut(res.tenantRut)} • {res.tenantEmail}
                          </p>
                        </div>
                      </div>

                      {/* Detalles del Arriendo Solicitado */}
                      <div className="p-3 rounded-xl bg-white text-xs space-y-1.5 text-slate-700 border border-slate-100 shadow-2xs group-hover:border-indigo-100 transition">
                        <div className="flex items-center justify-between gap-1.5 font-semibold text-slate-900">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <CalendarIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span className="font-bold truncate">
                              {res.startDate} · {res.rentalModality === 'por_hora' ? formatHourRange(res.hourStart, res.hourEnd) : formatUnits(res.totalDays, 'día')}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-indigo-600 whitespace-nowrap shrink-0">
                            Ver fecha
                          </span>
                        </div>
                        <p className="text-slate-600 line-clamp-2">
                          <strong className="text-slate-800">Motivo:</strong> {res.intendedUse}
                        </p>
                        <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between font-bold">
                          <span className="text-slate-500 font-medium">Para ti:</span>
                          <span className="text-emerald-700 font-bold text-xs">
                            {formatClp(res.subtotalClp - (res.platformFeeClp || 0))}
                          </span>
                        </div>
                      </div>

                      {/* Acciones bien alineadas sin desbordar */}
                      <div className="pt-1 space-y-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewReservationContract(res);
                            }}
                            className="py-2 px-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center gap-1 transition shadow-2xs cursor-pointer whitespace-nowrap"
                            title="Ver contrato digital formal para este arriendo"
                          >
                            <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>Ver contrato</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setContactModalTenant({
                                name: res.tenantName,
                                phone: '+56 9 8765 4321',
                                email: res.tenantEmail,
                                spaceTitle: res.spaceTitle,
                              });
                            }}
                            className="py-2 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
                            title="Contactar al arrendatario"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>Consultar</span>
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (res.startDate < todayIso) {
                              alert('Esta solicitud venció: su hora de inicio ya pasó y se rechaza automáticamente con devolución del 100 %.');
                              return;
                            }
                            changeReservationStatus(res.id, 'confirmed');
                          }}
                          className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Aceptar solicitud</span>
                        </button>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Card 2: Visitas Técnicas (Scouting) - Solo vigentes de hoy en adelante */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Visitas</h3>
                    <p className="text-xs text-slate-600">Personas que quieren conocer el espacio antes de arrendar</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                {upcomingVisitRequests.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs bg-slate-50/70 rounded-2xl border border-slate-100">
                    <Users className="w-7 h-7 mx-auto mb-1.5 text-slate-300" />
                    No tienes visitas agendadas.
                  </div>
                ) : (
                  upcomingVisitRequests.map((visit) => (
                    <div
                      key={visit.id}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{visit.tenantName}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          30 min · gratis
                        </span>
                      </div>
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-xs font-semibold text-slate-700">
                        <MapPin className="w-3 h-3 text-rose-500" />
                        <span>{visit.spaceTitle}</span>
                      </div>
                      <div className="text-xs text-slate-600 flex items-center gap-2">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{visit.visitDate} • {visit.visitTimeSlot}</span>
                      </div>
                      {visit.notes && (
                        <p className="text-xs text-slate-500 italic bg-white p-2 rounded-xl border border-slate-100">
                          "{visit.notes}"
                        </p>
                      )}
                      <div className="pt-1 flex items-center gap-2">
                        <button
                          onClick={() =>
                            setContactModalTenant({
                              name: visit.tenantName,
                              phone: visit.tenantPhone || '+56 9 8765 4321',
                              email: visit.tenantEmail,
                              spaceTitle: visit.spaceTitle,
                            })
                          }
                          className="flex-1 py-1.5 px-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs text-center transition cursor-pointer"
                        >
                          Contactar por WhatsApp
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pestaña: Visitas Solicitadas */}
      {activeTab === 'visits' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-5 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-600" />
              Solicitudes de visita
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Personas que quieren conocer tu espacio, en persona o por videollamada, antes de arrendar.
            </p>
          </div>

          {(() => {
            const myVisits = upcomingVisitRequests;
            if (myVisits.length === 0) {
              return (
                <div className="p-12 text-center text-slate-500 text-xs">
                  <MapPin className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                  No tienes visitas técnicas vigentes agendadas desde hoy ({todayIso}) en adelante. Las visitas de fechas pasadas se ocultan automáticamente.
                </div>
              );
            }
            return (
              <div className="divide-y divide-slate-100">
                {myVisits.map((visit) => (
                  <div key={visit.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 transition">
                    <div className="flex items-start gap-4">
                      {visit.spaceImage && (
                        <img
                          src={visit.spaceImage}
                          alt={visit.spaceTitle}
                          className="w-16 h-16 rounded-xl object-cover border border-slate-200 shadow-xs shrink-0"
                        />
                      )}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-500">#{visit.id.slice(-6)}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              visit.status === 'confirmed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : visit.status === 'pending'
                                ? 'bg-amber-100 text-amber-800'
                                : visit.status === 'cancelled'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {visit.status === 'confirmed'
                              ? 'Confirmada'
                              : visit.status === 'pending'
                              ? 'Pendiente'
                              : visit.status === 'cancelled'
                              ? 'Cancelada'
                              : 'Completada'}
                          </span>
                        </div>

                        <div className="text-sm font-bold text-slate-900">{visit.spaceTitle}</div>
                        <div className="text-xs text-slate-500">{visit.spaceAddress}</div>

                        <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span>Visitante: <strong className="text-slate-800">{visit.tenantName}</strong></span>
                          <span>Email: <strong className="text-slate-800">{visit.tenantEmail}</strong></span>
                          <span>Teléfono: <strong className="text-slate-800">{visit.tenantPhone}</strong></span>
                        </div>

                        <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span>Fecha: <strong>{visit.visitDate}</strong></span>
                          <span>Horario: <strong>{visit.visitTimeSlot}</strong></span>
                          <span>Modalidad: <strong>{visit.modality === 'presencial' ? 'Presencial' : 'Virtual'}</strong></span>
                          <span>Asistentes: <strong>{visit.attendeesCount}</strong></span>
                        </div>

                        {visit.notes && (
                          <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2 border border-slate-200">
                            <span className="font-bold text-slate-700">Nota del visitante:</span> {visit.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
      </TabPanel>
      </div>
      </DashboardShell>

      {/* Modal para Publicar o Modificar Espacio */}
      {isPublishModalOpen && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200 animate-fadeIn my-auto max-h-[92dvh] flex flex-col">
            <div className="bg-slate-900 text-white p-5 sm:p-6 relative shrink-0">
              <button
                onClick={() => {
                  resetForm();
                  setIsPublishModalOpen(false);
                }}
                className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition"
              >
                ✕
              </button>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  {editingSpace ? 'Editar espacio' : 'Nuevo espacio'}
                </span>
                <span className="text-xs text-slate-500 font-mono">Ley N° 18.101</span>
              </div>
              <h2 className="text-xl font-bold">
                {editingSpace ? `Modificar Espacio: ${editingSpace.title}` : 'Publicar nuevo espacio en Spotly'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {editingSpace
                  ? 'Actualiza los precios por hora, día o mes, descripción y fotografías de tu espacio.'
                  : 'Cuenta cómo es tu espacio, sube fotos reales y define precios y condiciones.'}
              </p>
            </div>

            <PublishSpaceForm
              key={editingSpace?.id || 'nuevo'}
              editingSpace={editingSpace}
              onCancel={() => {
                resetForm();
                setIsPublishModalOpen(false);
              }}
              onSubmit={handleSubmitSpace}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Bloqueos de disponibilidad: por horas, días o mes completo (space_blocks) */}
      {isMaintenanceModalOpen && selectedSpace && (
        <SpaceBlockModal
          space={selectedSpace}
          initialDate={maintenanceDate}
          blocks={maintenanceBlocks}
          onClose={() => setIsMaintenanceModalOpen(false)}
          onAdd={addSpaceBlock}
          onRemove={removeSpaceBlock}
        />
      )}

      {/* Confirmación para eliminar una publicación */}
      {spaceToDelete &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            onClick={() => !isDeletingSpace && setSpaceToDelete(null)}
          >
            <div
              className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100"
              onClick={(e) => e.stopPropagation()}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-space-title"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 id="delete-space-title" className="text-sm font-bold text-slate-900">
                    ¿Eliminar "{spaceToDelete.title}"?
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    La publicación dejará de aparecer en Spotly y en tu panel. Si tuvo reservas, sus contratos y pagos
                    se conservan en el historial. No se puede eliminar si tiene reservas activas o próximas.
                  </p>
                </div>
              </div>
              {deleteError && (
                <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800" role="alert">
                  {deleteError}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isDeletingSpace}
                  onClick={() => setSpaceToDelete(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                {spaceToDelete.status === 'active' && (
                  <button
                    type="button"
                    disabled={isDeletingSpace}
                    onClick={() => {
                      updateSpace(spaceToDelete.id, { status: 'paused' });
                      setSpaceToDelete(null);
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                  >
                    Solo pausar
                  </button>
                )}
                <button
                  type="button"
                  disabled={isDeletingSpace}
                  onClick={handleConfirmDeleteSpace}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isDeletingSpace ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal para Contactar al Arrendatario */}
      {contactModalTenant && (
        <ContactTenantModal tenant={contactModalTenant} onClose={() => setContactModalTenant(null)} />
      )}

      {/* Confirmación para cancelar una reserva confirmada */}
      {cancelTarget && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-labelledby="owner-cancel-title">
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                <XCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 id="owner-cancel-title" className="text-base font-bold text-slate-900">Cancelar reserva #{cancelTarget.id.slice(-6)}</h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  {cancelTarget.spaceTitle} · {cancelTarget.tenantName} · {cancelTarget.startDate}
                  {cancelTarget.hourStart != null && cancelTarget.hourEnd != null
                    ? ` · ${String(cancelTarget.hourStart).padStart(2, '0')}:00 a ${String(cancelTarget.hourEnd).padStart(2, '0')}:00`
                    : ''}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Al cancelar como propietario se le devuelve al arrendatario el <strong>100 % de lo pagado ({formatClp(cancelTarget.totalClp)})</strong> y se le avisa con el motivo. El horario vuelve a quedar libre.
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-800">Motivo (lo verá el arrendatario)</span>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ej.: corte de luz programado en el edificio ese día."
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              />
            </label>
            {cancelError && <p className="text-xs font-semibold text-rose-600" role="alert">{cancelError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={cancelBusy}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={submitOwnerCancel}
                disabled={cancelBusy}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
              >
                {cancelBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Cancelar y reembolsar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal para ver detalle de un día específico en el calendario */}
      {selectedDayInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {selectedDayInfo.date}
                </h3>
                <p className="text-xs text-slate-500">{selectedSpace?.title}</p>
              </div>
              <button
                onClick={() => setSelectedDayInfo(null)}
                className="p-1 text-slate-500 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {(() => {
                const { booking, visit, maintenance } = getDayEventsForSelectedSpace(selectedDayInfo.date);

                if (booking) {
                  const isPastBooking = booking.startDate < todayIso || isExpiredRequest(booking, chileNow);
                  return (
                    <div className="p-4 rounded-2xl bg-rose-50/90 border border-rose-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {booking.status === 'confirmed'
                            ? 'Reserva confirmada'
                            : isPastBooking
                              ? 'Solicitud vencida'
                              : 'Solicitud pendiente'}
                        </span>
                        <span className="font-bold text-rose-700 text-sm">{formatClp(booking.subtotalClp)}</span>
                      </div>

                      {/* DETALLE EXACTO DE DÍA, HORA O MES SOLICITADO */}
                      <div className="p-3 bg-white rounded-xl border border-rose-100 space-y-2">
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          {booking.rentalModality === 'por_hora' || booking.hourStart !== undefined ? (
                            <>
                              <Clock className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Horario: <strong>{formatHourRange(booking.hourStart, booking.hourEnd)}</strong></span>
                            </>
                          ) : booking.rentalModality === 'mensual' ? (
                            <>
                              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Mes: <strong>{booking.rentalMonth || `desde el ${booking.startDate}`}</strong></span>
                            </>
                          ) : (
                            <>
                              <CalendarIcon className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Jornada completa: <strong>{booking.startDate} al {booking.endDate}</strong> ({booking.totalDays} {booking.totalDays === 1 ? 'día' : 'días'})</span>
                            </>
                          )}
                        </div>

                        <div className="flex items-start gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 p-2 rounded-lg">
                          <Lock className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                          <span>Este horario está bloqueado: nadie más puede reservarlo.</span>
                        </div>
                      </div>

                      <div className="space-y-1 text-xs text-slate-700">
                        <p>Cliente: <strong>{booking.tenantName}</strong> (RUT: {booking.tenantRut ? formatRut(booking.tenantRut) : 'no informado'})</p>
                        <p>Uso: <em>"{booking.intendedUse}"</em></p>
                      </div>

                      <div className="space-y-2 pt-1">
                        <button
                          onClick={() => {
                            setSelectedDayInfo(null);
                            handleViewReservationContract(booking);
                          }}
                          className="w-full py-2 rounded-xl bg-white border border-rose-200 text-rose-800 font-bold text-xs hover:bg-rose-100 transition cursor-pointer"
                        >
                          Ver contrato
                        </button>

                        {booking.status === 'pending' && (
                          isPastBooking ? (
                            <div className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 font-bold text-xs text-center flex items-center justify-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 text-slate-500" />
                              <span>Vencida sin respuesta • se devuelve el 100 % al arrendatario</span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <button
                                onClick={() => {
                                  if (booking.startDate < todayIso) {
                                    alert('Esta solicitud venció: su hora de inicio ya pasó y se rechaza automáticamente con devolución del 100 %.');
                                    return;
                                  }
                                  changeReservationStatus(booking.id, 'confirmed');
                                  setSelectedDayInfo(null);
                                }}
                                className="py-2 px-2 rounded-xl font-bold text-xs transition cursor-pointer text-center bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                              >
                                Aceptar
                              </button>
                              <button
                                onClick={() => {
                                  if (booking.startDate < todayIso) {
                                    alert('Esta reserva ya pasó y no se puede modificar.');
                                    return;
                                  }
                                  changeReservationStatus(booking.id, 'rejected');
                                  setSelectedDayInfo(null);
                                }}
                                className="py-2 px-2 rounded-xl bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 font-bold text-xs transition cursor-pointer text-center"
                              >
                                Rechazar
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  );
                }

                if (visit) {
                  return (
                    <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-1.5">
                      <span className="font-bold text-indigo-900">Visita agendada</span>
                      <p className="text-slate-700">Cliente: <strong>{visit.tenantName}</strong></p>
                      <p className="text-slate-600">Horario: {visit.visitTimeSlot}</p>
                    </div>
                  );
                }

                const isSelectedModalDayPast = selectedDayInfo.date < todayIso;

                if (maintenance) {
                  return (
                    <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-200 space-y-1.5">
                      <span className="font-bold text-slate-900">Bloqueo: {describeBlock(maintenance)}</span>
                      <p className="text-slate-600">{maintenance.reason}</p>
                      {isSelectedModalDayPast ? (
                        <span className="text-slate-500 font-semibold text-xs flex items-center gap-1 pt-1">
                          <Lock className="w-3 h-3" />
                          Día pasado
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            handleRemoveMaintenanceBlock(maintenance.id);
                            setSelectedDayInfo(null);
                          }}
                          className="text-rose-600 font-bold hover:underline"
                        >
                          Eliminar bloqueo
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                    <p className="font-bold text-emerald-900">
                      {isSelectedModalDayPast ? 'Día pasado, sin reservas' : 'Día libre'}
                    </p>
                    <p className="text-xs text-emerald-700">
                      Tarifa vigente: {selectedSpace?.pricePerHour || selectedSpace?.pricePerDay ? formatClp(selectedSpace.pricePerHour || selectedSpace.pricePerDay) : 'sin tarifa'}
                    </p>
                    {isSelectedModalDayPast ? (
                      <div className="w-full py-2 px-3 rounded-xl bg-slate-200 text-slate-500 font-bold text-xs flex items-center justify-center gap-1.5 cursor-not-allowed">
                        <Lock className="w-3.5 h-3.5" />
                        <span>Ya pasó</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setMaintenanceDate(selectedDayInfo.date);
                          setSelectedDayInfo(null);
                          setIsMaintenanceModalOpen(true);
                        }}
                        className="w-full py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs transition"
                      >
                        Bloquear este día
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal para visualizar contratos */}
      <ContractModal
        contract={selectedContract}
        isOpen={Boolean(selectedContract)}
        onClose={() => setSelectedContract(null)}
      />
    </div>
  );
};
