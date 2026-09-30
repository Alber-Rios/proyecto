import React, { useState, useMemo } from 'react';
import { Space, Reservation, SpaceCategory, SpaceEnvironment, DigitalContract, VisitRequest } from '../types.ts';
import { useApp } from '../context/AppContext.tsx';
import { formatClp, formatRut, getSpaceAvailableModalities, getSpaceRateInfo, getTodayIso } from '../utils/formatters.ts';
import { ContractModal } from '../components/ContractModal.tsx';
import { RentalModalitySelector } from '../components/RentalModalitySelector.tsx';
import { SpaceAvailabilityViewer } from '../components/SpaceAvailabilityViewer.tsx';
import { generateDigitalContract } from '../utils/contractGenerator.ts';
import {
  downloadContractDocument,
  downloadReservationDocument,
} from '../utils/documentDownloader.ts';
import {
  Building,
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
  Sparkles,
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
} from 'lucide-react';

interface OwnerDashboardPageProps {
  onOpenOwnerUpgrade: () => void;
  onOpenAuth?: (mode: 'login' | 'register', notice?: string) => void;
}

const CHILEAN_COMMUNES = [
  'Las Condes',
  'Providencia',
  'Santiago Centro',
  'Ñuñoa',
  'Vitacura',
  'Lo Barnechea',
  'Macul',
];

const POPULAR_AMENITIES = [
  'Wifi Fibra Óptica 1Gbps',
  'Aire Acondicionado / Climatización',
  'Calefacción Central',
  'Seguridad y Cámaras 24/7',
  'Proyector 4K & Telón',
  'Pizarra Acrílica',
  'Estacionamiento Clientes',
  'Recepción y Conserjería',
  'Cocina / Cafetería Equipada',
  'Acceso Universal / Rampas',
  'Ascensor de Alta Velocidad',
  'Grupo Electrógeno',
];

const POPULAR_RULES = [
  'Prohibido fumar en recintos cerrados (Ley 20.660)',
  'Música moderada / Sin ruidos molestos post 22:00',
  'Entregar el espacio aseado y ordenado',
  'Mascotas permitidas (Pet Friendly)',
  'Catering y banquetería externa permitida',
  'Capacidad máxima estrictamente respetada',
];

const AVAILABILITY_DAY_OPTIONS = [
  { value: 'Lun-Vie', label: 'Lunes a Viernes (Lun-Vie)' },
  { value: 'Lun-Sáb', label: 'Lunes a Sábado (Lun-Sáb)' },
  { value: 'Lun-Dom', label: 'Todos los días (Lun-Dom)' },
  { value: 'Sáb-Dom', label: 'Fines de Semana (Sáb-Dom)' },
  { value: '24/7', label: '24 Horas / 7 Días (Continuo)' },
];

const OPERATION_HOUR_OPTIONS = [
  '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30',
  '22:00', '22:30', '23:00', '23:30', '24:00',
];

const parsePositiveIntInput = (raw: string): number | '' => {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (digits === '') return '';
  return parseInt(digits, 10);
};

// Presets removidos por solicitud del usuario

export const OwnerDashboardPage: React.FC<OwnerDashboardPageProps> = ({ onOpenOwnerUpgrade, onOpenAuth }) => {
  const {
    currentUser,
    spaces,
    reservations,
    contracts,
    createSpace,
    updateSpace,
    deleteSpace,
    updateReservationStatus,
    visitRequests,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'spaces' | 'bookings' | 'finances' | 'calendar' | 'visits'>('calendar');
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);
  const [selectedContract, setSelectedContract] = useState<DigitalContract | null>(null);

  // Estados para selector de espacio y calendario interactivo
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>('');
  const [currentCalendarDate, setCurrentCalendarDate] = useState<Date>(() => new Date());
  const [calendarViewMode, setCalendarViewMode] = useState<'month' | 'week' | 'list'>('month');
  const [pendingFilter, setPendingFilter] = useState<'all' | 'selected'>('all');
  const [bookingListStatusFilter, setBookingListStatusFilter] = useState<'pending_valid' | 'all' | 'confirmed' | 'past'>('pending_valid');
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [maintenanceDate, setMaintenanceDate] = useState(() => getTodayIso());
  const [maintenanceReason, setMaintenanceReason] = useState('');
  const [maintenanceBlocks, setMaintenanceBlocks] = useState<{ id: string; spaceId: string; date: string; reason: string }[]>([]);
  const [contactModalTenant, setContactModalTenant] = useState<{ name: string; phone: string; email: string; spaceTitle: string } | null>(null);
  const [selectedDayInfo, setSelectedDayInfo] = useState<{ date: string; dayNumber: number } | null>(null);
  const [ownerSelectedDate, setOwnerSelectedDate] = useState<string>(() => getTodayIso());

  // Formulario para nuevo espacio
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<SpaceCategory>('office');
  const [newEnvironment, setNewEnvironment] = useState<SpaceEnvironment>('cerrado');
  const [newRentalModality, setNewRentalModality] = useState<'por_hora' | 'por_dia' | 'mensual' | 'abierto'>('abierto');
  
  // Estados de modalidades y tarifas tipo interruptor
  const [enableHourly, setEnableHourly] = useState(true);
  const [hourlyPrice, setHourlyPrice] = useState<number | ''>('');
  const [hourlyMinHours, setHourlyMinHours] = useState<number | ''>('');
  const [hourlyInstantBooking, setHourlyInstantBooking] = useState(true);

  const [enableDaily, setEnableDaily] = useState(true);
  const [dailyPrice, setDailyPrice] = useState<number | ''>('');
  const [dailyOpeningHours, setDailyOpeningHours] = useState('08:30 - 20:30');

  const [enableMonthly, setEnableMonthly] = useState(true);
  const [monthlyPrice, setMonthlyPrice] = useState<number | ''>('');

  const computedRentalModality = useMemo<'abierto' | 'por_hora' | 'por_dia' | 'mensual'>(() => {
    const activeCount = (enableHourly ? 1 : 0) + (enableDaily ? 1 : 0) + (enableMonthly ? 1 : 0);
    if (activeCount > 1) return 'abierto';
    if (enableHourly) return 'por_hora';
    if (enableMonthly) return 'mensual';
    return 'por_dia';
  }, [enableHourly, enableDaily, enableMonthly]);

  const [newCommune, setNewCommune] = useState('Las Condes');
  const [newAddress, setNewAddress] = useState('');
  const [newPrice, setNewPrice] = useState<number | ''>('');
  const [newCapacity, setNewCapacity] = useState<number | ''>('');
  const [newSurfaceM2, setNewSurfaceM2] = useState<number | ''>('');
  const [newSecurityDeposit, setNewSecurityDeposit] = useState<number | ''>('');
  const [newMinBookingDays, setNewMinBookingDays] = useState<number | ''>(1);
  const [operationDays, setOperationDays] = useState('Lun-Vie');
  const [operationStartHour, setOperationStartHour] = useState('08:30');
  const [operationEndHour, setOperationEndHour] = useState('20:30');
  const [newOpeningHours, setNewOpeningHours] = useState('Lun-Vie 08:30-20:30');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<string[]>([]);

  // CASO 1: Usuario No Registrado / No Autenticado
  if (!currentUser) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-lg space-y-6">
          <div className="w-16 h-16 bg-gradient-to-tr from-amber-500 to-rose-600 text-white rounded-3xl flex items-center justify-center mx-auto shadow-md">
            <Building className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
              Panel de Anfitriones y Propietarios
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Publica y administra tus inmuebles en Chile
            </h2>
            <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
              Rentabiliza tus oficinas, salas de conferencia, plantas libres o recintos comerciales en pesos chilenos (CLP) con contratos digitales regulados por la Ley N° 18.101.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => onOpenAuth?.('login', 'Inicia sesión como Propietario para administrar tus recintos.')}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => onOpenAuth?.('register', 'Regístrate con rol de Propietario para comenzar a publicar.')}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              Registrarme como Propietario
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
            <h2 className="text-xl font-bold text-slate-900">Sesión de Administrador Activa</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              El rol de Administrador supervisa la plataforma desde el Panel de Administración y no publica ni arrienda propiedades a título personal.
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
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
              Acceso Restringido • Perfil de Arrendatario
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              No tienes habilitado el perfil de Propietario
            </h2>
            <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
              En Spotly, los usuarios con rol de Arrendatario solo tienen acceso a buscar y agendar espacios. Para publicar recintos, gestionar disponibilidad y recibir ingresos en CLP, debes suscribir el Acuerdo de Adhesión para Anfitriones conforme a la Ley 18.101.
            </p>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={onOpenOwnerUpgrade}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              Aceptar Términos y Convertirme en Propietario
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
  const todayIso = useMemo(() => getTodayIso(), []);

  // Reservas recibidas para las propiedades de este propietario
  const myReceivedBookings = useMemo(() => {
    return reservations.filter((r) => r.ownerId === currentUser.id);
  }, [reservations, currentUser.id]);

  // Solicitudes pendientes válidas para aprobar (del día actual hacia adelante)
  const pendingValidBookings = useMemo(() => {
    return myReceivedBookings.filter(
      (b) => b.status === 'pending' && b.startDate >= todayIso
    );
  }, [myReceivedBookings, todayIso]);

  // Visitas técnicas vigentes (solo desde hoy en adelante; si ya pasó el día de la visita ya no aparece)
  const upcomingVisitRequests = useMemo(() => {
    return visitRequests.filter(
      (v) => v.ownerId === currentUser.id && v.visitDate >= todayIso && v.status !== 'cancelled'
    );
  }, [visitRequests, currentUser.id, todayIso]);

  // Métricas financieras reales del propietario y desglose real por cada lugar
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
      const fee = b.platformFeeClp ?? Math.round(b.subtotalClp * 0.05);
      if (b.status === 'pending' && b.startDate >= todayIso) {
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

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    (Array.from(files) as File[]).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setNewImages((prev) => [...prev, ev.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveImage = (index: number) => {
    setNewImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Funciones de carga rápida y URL personalizadas eliminadas por solicitud del usuario

  const handleToggleAmenity = (amenity: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(amenity) ? prev.filter((a) => a !== amenity) : [...prev, amenity]
    );
  };

  const handleToggleRule = (rule: string) => {
    setSelectedRules((prev) =>
      prev.includes(rule) ? prev.filter((r) => r !== rule) : [...prev, rule]
    );
  };

  const handleStartEdit = (space: Space) => {
    setEditingSpace(space);
    setNewTitle(space.title);
    setNewDescription(space.description);
    setNewCategory(space.category);
    setNewEnvironment(space.spaceEnvironment || 'cerrado');
    const mod = space.rentalModality || (space.priceUnit === 'hour' ? 'por_hora' : space.priceUnit === 'month' ? 'mensual' : 'por_dia');
    setNewRentalModality(mod);
    setNewCommune(space.commune);
    setNewAddress(space.address);

    const enabledModalities = getSpaceAvailableModalities(space);
    setEnableHourly(enabledModalities.includes('por_hora'));
    setEnableDaily(enabledModalities.includes('por_dia'));
    setEnableMonthly(enabledModalities.includes('mensual'));

    setHourlyPrice(space.pricePerHour || (space.pricePerDay ? Math.round(space.pricePerDay / 8) : 45000));
    setHourlyMinHours(space.minBookingHours || 2);
    setHourlyInstantBooking(space.instantBooking ?? true);

    setDailyPrice(space.pricePerDay || 280000);
    setDailyOpeningHours(space.openingHours || '08:30 - 20:30');

    setMonthlyPrice(space.pricePerMonth || (space.pricePerDay ? space.pricePerDay * 22 : 3800000));
    setNewSecurityDeposit(space.securityDeposit && space.securityDeposit > 0 ? space.securityDeposit : '');

    const effectivePrice = mod === 'por_hora' 
      ? (space.pricePerHour || Math.round(space.pricePerDay / 8))
      : mod === 'mensual'
      ? (space.pricePerMonth || space.pricePerDay)
      : space.pricePerDay;
    setNewPrice(effectivePrice && effectivePrice > 0 ? effectivePrice : '');
    setNewCapacity(space.capacity && space.capacity > 0 ? space.capacity : '');
    setNewSurfaceM2(space.surfaceM2 && space.surfaceM2 > 0 ? space.surfaceM2 : '');
    setNewMinBookingDays(space.minBookingDays || 1);

    const rawHours = space.openingHours || 'Lun-Vie 08:30-20:30';
    const timeMatch = rawHours.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    const startH = timeMatch ? timeMatch[1] : '08:30';
    const endH = timeMatch ? timeMatch[2] : '20:30';
    const detectedDay = AVAILABILITY_DAY_OPTIONS.find((d) => rawHours.includes(d.value))?.value || 'Lun-Vie';
    setOperationDays(detectedDay);
    setOperationStartHour(startH);
    setOperationEndHour(endH);
    setNewOpeningHours(detectedDay === '24/7' ? 'Lun-Dom 00:00-24:00 (24/7)' : `${detectedDay} ${startH}-${endH}`);

    setSelectedAmenities(space.amenities || []);
    setSelectedRules(space.rules || []);
    setNewImages(space.images || []);
    setIsPublishModalOpen(true);
  };

  const resetForm = () => {
    setEditingSpace(null);
    setNewTitle('');
    setNewDescription('');
    setNewAddress('');
    setEnableHourly(true);
    setEnableDaily(true);
    setEnableMonthly(true);
    setHourlyPrice('');
    setHourlyMinHours('');
    setHourlyInstantBooking(true);
    setDailyPrice('');
    setDailyOpeningHours('08:30 - 20:30');
    setMonthlyPrice('');
    setNewSecurityDeposit('');
    setNewPrice('');
    setNewCapacity('');
    setNewSurfaceM2('');
    setNewMinBookingDays(1);
    setOperationDays('Lun-Vie');
    setOperationStartHour('08:30');
    setOperationEndHour('20:30');
    setNewOpeningHours('Lun-Vie 08:30-20:30');
    setSelectedAmenities([]);
    setSelectedRules([]);
    setNewImages([]);
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

  const handlePublishSpace = (e: React.FormEvent) => {
    e.preventDefault();

    if (currentUser.verificationStatus !== 'verified') {
      alert('Tu cuenta debe estar verificada y aprobada por el administrador para publicar o modificar espacios.');
      return;
    }

    if (!newTitle.trim() || !newAddress.trim()) {
      alert('Por favor completa el título y la dirección del espacio.');
      return;
    }

    if (!newCapacity || Number(newCapacity) <= 0 || !Number.isInteger(Number(newCapacity))) {
      alert('La Capacidad Máxima debe ser un número entero mayor a 0.');
      return;
    }

    if (!newSurfaceM2 || Number(newSurfaceM2) <= 0 || !Number.isInteger(Number(newSurfaceM2))) {
      alert('La Superficie Total (m²) debe ser un número entero mayor a 0.');
      return;
    }

    if (!newSecurityDeposit || Number(newSecurityDeposit) <= 0 || !Number.isInteger(Number(newSecurityDeposit))) {
      alert('El monto de Garantía debe ser un número entero mayor a 0.');
      return;
    }

    if (enableHourly) {
      if (!hourlyPrice || Number(hourlyPrice) <= 0 || !Number.isInteger(Number(hourlyPrice))) {
        alert('El precio por hora ($) debe ser un número entero mayor a 0.');
        return;
      }
      if (!hourlyMinHours || Number(hourlyMinHours) <= 0 || !Number.isInteger(Number(hourlyMinHours))) {
        alert('El mínimo de horas (hr) debe ser un número entero mayor a 0.');
        return;
      }
    }

    if (enableDaily && (!dailyPrice || Number(dailyPrice) <= 0 || !Number.isInteger(Number(dailyPrice)))) {
      alert('El precio por día ($) debe ser un número entero mayor a 0.');
      return;
    }

    if (enableMonthly && (!monthlyPrice || Number(monthlyPrice) <= 0 || !Number.isInteger(Number(monthlyPrice)))) {
      alert('La tarifa mensual ($) debe ser un número entero mayor a 0.');
      return;
    }

    if (newImages.length === 0) {
      alert('Por favor añade al menos una fotografía del espacio.');
      return;
    }

    const hourPrice = enableHourly ? Number(hourlyPrice) : undefined;
    const dayPrice = enableDaily 
      ? Number(dailyPrice) 
      : enableHourly 
      ? Math.round(Number(hourlyPrice) * 8) 
      : Math.round(Number(monthlyPrice) / 30);
    const monthPrice = enableMonthly ? Number(monthlyPrice) : undefined;
    const enabledModalities = [
      ...(enableHourly ? ['por_hora' as const] : []),
      ...(enableDaily ? ['por_dia' as const] : []),
      ...(enableMonthly ? ['mensual' as const] : []),
    ];
    const unit = computedRentalModality === 'por_hora' ? 'hour' : computedRentalModality === 'mensual' ? 'month' : 'day';
    const computedOpeningSchedule =
      operationDays === '24/7'
        ? 'Lun-Dom 00:00-24:00 (24/7)'
        : `${operationDays} ${operationStartHour}-${operationEndHour}`;

    if (editingSpace) {
      updateSpace(editingSpace.id, {
        title: newTitle,
        description: newDescription,
        category: newCategory,
        spaceEnvironment: newEnvironment,
        rentalModality: computedRentalModality,
        enabledModalities,
        priceUnit: unit,
        commune: newCommune,
        address: newAddress,
        pricePerDay: dayPrice,
        pricePerHour: hourPrice,
        pricePerMonth: monthPrice,
        capacity: Number(newCapacity),
        surfaceM2: Number(newSurfaceM2),
        amenities: selectedAmenities,
        rules: selectedRules,
        openingHours: computedOpeningSchedule,
        securityDeposit: Number(newSecurityDeposit),
        images: newImages,
        minBookingDays: Number(newMinBookingDays) || 1,
        minBookingHours: Number(hourlyMinHours) || 1,
        instantBooking: hourlyInstantBooking,
      });

      alert('¡Espacio modificado y actualizado exitosamente!');
    } else {
      createSpace({
        title: newTitle,
        description: newDescription,
        category: newCategory,
        spaceEnvironment: newEnvironment,
        rentalModality: computedRentalModality,
        enabledModalities,
        priceUnit: unit,
        commune: newCommune,
        region: 'Región Metropolitana',
        address: newAddress,
        pricePerDay: dayPrice,
        pricePerHour: hourPrice,
        pricePerMonth: monthPrice,
        capacity: Number(newCapacity),
        surfaceM2: Number(newSurfaceM2),
        amenities: selectedAmenities,
        rules: selectedRules,
        openingHours: computedOpeningSchedule,
        securityDeposit: Number(newSecurityDeposit),
        images: newImages,
        isVerified: true,
        status: 'pending_approval',
        minBookingDays: Number(newMinBookingDays) || 1,
        minBookingHours: Number(hourlyMinHours) || 1,
        instantBooking: hourlyInstantBooking,
      });

      alert('¡Publicación enviada exitosamente! Tu espacio ha ingresado a moderación y será visible en el catálogo una vez aprobado por el administrador.');
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

    // Generar contrato digital formal con RUTs, garantías y token hash si no fue creado previamente
    const generated = generateDigitalContract({
      reservationId: reservation.id,
      spaceTitle: reservation.spaceTitle,
      spaceAddress: reservation.spaceAddress,
      tenantName: reservation.tenantName,
      tenantRut: reservation.tenantRut,
      ownerName: reservation.ownerName,
      ownerRut: reservation.ownerRut || currentUser?.rut || '14.258.963-7',
      totalClp: reservation.totalClp,
      guaranteeDepositClp: reservation.securityDepositClp,
      startDate: reservation.startDate,
      endDate: reservation.endDate,
      ip: '200.89.68.114',
      priceUnit: reservation.priceUnit || 'day',
      rentalModality: reservation.rentalModality || 'por_dia',
      durationUnits: reservation.durationUnits || reservation.totalDays || 1,
      hourStart: reservation.hourStart,
      hourEnd: reservation.hourEnd,
      intendedUse: reservation.intendedUse,
    });
    setSelectedContract(generated);
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
    const maintenance = maintenanceBlocks.find(
      (m) => m.spaceId === selectedSpace.id && m.date === dateString
    );

    return { booking, visit, maintenance };
  };

  // Leyenda de tarifa dinámica para el recinto seleccionado
  const spaceLegendRate = useMemo(() => {
    if (!selectedSpace) return 'Disponible';
    if (selectedSpace.rentalModality === 'por_hora' || selectedSpace.pricePerHour) {
      const kRate = Math.round((selectedSpace.pricePerHour || 45000) / 1000);
      return `Disponible ($${kRate}k/h)`;
    }
    if (selectedSpace.rentalModality === 'mensual' || selectedSpace.pricePerMonth) {
      const mRate = ((selectedSpace.pricePerMonth || 3800000) / 1000000).toFixed(1);
      return `Disponible ($${mRate}M/mes)`;
    }
    const kRate = Math.round((selectedSpace.pricePerDay || 280000) / 1000);
    return `Disponible ($${kRate}k/día)`;
  }, [selectedSpace]);

  const spaceModalityLabel = useMemo(() => {
    if (!selectedSpace) return 'Modalidad Estándar';
    if (selectedSpace.rentalModality === 'abierto') return 'Modalidad Híbrida: Por Hora & Día';
    if (selectedSpace.rentalModality === 'por_hora') return 'Modalidad: Por Hora';
    if (selectedSpace.rentalModality === 'mensual') return 'Modalidad: Mensual';
    return 'Modalidad: Por Día';
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

  const handleAddMaintenanceBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSpace) return;
    if (!maintenanceDate) {
      alert('Por favor selecciona una fecha');
      return;
    }
    if (maintenanceDate < todayIso) {
      alert(`No puedes bloquear ni modificar fechas anteriores a hoy (${todayIso}). El historial hacia atrás es exclusivamente de solo lectura.`);
      return;
    }
    const newBlock = {
      id: `m-${Date.now()}`,
      spaceId: selectedSpace.id,
      date: maintenanceDate,
      reason: maintenanceReason || 'Bloqueo por Mantención Programada',
    };
    setMaintenanceBlocks((prev) => [...prev, newBlock]);
    setIsMaintenanceModalOpen(false);
  };

  const handleRemoveMaintenanceBlock = (id: string) => {
    const target = maintenanceBlocks.find((m) => m.id === id);
    if (target && target.date < todayIso) {
      alert(`No puedes modificar ni eliminar bloqueos de fechas pasadas (${target.date}). El historial es de solo lectura.`);
      return;
    }
    setMaintenanceBlocks((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Encabezado del Panel de Propietario */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 whitespace-nowrap ${
              currentUser.verificationStatus === 'verified'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : 'bg-amber-100 text-amber-800'
            }`}>
              <Building className="w-3.5 h-3.5 shrink-0" />
              {currentUser.verificationStatus === 'verified' ? 'Anfitrión Verificado' : 'Verificación Pendiente'}
            </span>
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">RUT: {formatRut(currentUser.rut)}</span>
            <span className="text-xs text-slate-300 hidden sm:inline">•</span>
            <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1 whitespace-nowrap">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              Pagos Habilitados Webpay / Stripe
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 mt-1.5 tracking-tight">
            Panel de Control de Propietario
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 max-w-3xl">
            Gestiona tus espacios en Chile, aprueba solicitudes de arriendo en tiempo real y supervisa la ocupación y liquidaciones en CLP conforme a Ley 18.101.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 shrink-0 w-full lg:w-auto">
          <button
            onClick={() => setActiveTab('finances')}
            className="w-full sm:w-auto px-4 py-2.5 rounded-2xl font-bold text-xs border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap"
            title="Configuración de cuentas bancarias y liquidaciones"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>Configuración</span>
          </button>

          <button
            id="owner-publish-space-btn"
            onClick={() => {
              if (currentUser.verificationStatus !== 'verified') {
                alert('Debes completar la verificación de identidad y contar con la aprobación del Administrador antes de publicar espacios.');
                return;
              }
              setIsPublishModalOpen(true);
            }}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-2xl font-bold text-xs shadow-sm transition flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap ${
              currentUser.verificationStatus === 'verified'
                ? 'bg-rose-600 hover:bg-rose-700 text-white hover:shadow'
                : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
            }`}
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>Publicar Nuevo Espacio</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de Métricas Reales (Calculadas dinámicamente de los espacios y reservas reales) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Espacios Publicados (Datos Reales) */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>ESPACIOS PUBLICADOS</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {financialMetrics.activeSpacesCount} de {mySpaces.length} activos ({financialMetrics.operationalPct}%)
            </span>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">{mySpaces.length}</div>
            <p className="text-[11px] text-slate-500 mt-1 truncate">
              {mySpaces.map((s) => s.commune).filter((v, i, a) => a.indexOf(v) === i).join(' · ') || 'Sin recintos publicados'}
            </p>
            {financialMetrics.pendingSpacesCount > 0 && (
              <p className="text-[10px] text-amber-700 font-semibold mt-0.5">
                • {financialMetrics.pendingSpacesCount} en moderación del Administrador
              </p>
            )}
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              onClick={() => setActiveTab('spaces')}
              className="text-rose-600 hover:text-rose-700 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <span>Gestionar</span>
              <span>→</span>
            </button>
          </div>
        </div>

        {/* Card 2: Solicitudes Pendientes (Datos Reales) */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>SOLICITUDES POR APROBAR</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
              Hoy en adelante
            </span>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {pendingValidBookings.length}
            </div>
            <p className="text-[11px] text-amber-700 font-medium mt-1">
              {selectedSpace
                ? `${pendingValidBookings.filter((b) => b.spaceId === selectedSpace.id).length} en ${selectedSpace.title}`
                : 'Reservas vigentes listas para revisión'}
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              onClick={() => setActiveTab('bookings')}
              className="text-rose-600 hover:text-rose-700 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <span>Revisar Ahora</span>
              <span>→</span>
            </button>
          </div>
        </div>

        {/* Card 3: Ganancias Reales (CLP) */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>GANANCIA NETA REAL (CLP)</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {financialMetrics.confirmedCount} confirmadas
            </span>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {formatClp(financialMetrics.netPayout)}
            </div>
            <p className="text-[11px] text-emerald-800 font-semibold mt-1 truncate">
              {selectedSpace && financialMetrics.bySpace[selectedSpace.id]
                ? `${selectedSpace.title}: ${formatClp(financialMetrics.bySpace[selectedSpace.id].netPayout)}`
                : `Bruto: ${formatClp(financialMetrics.grossIncome)}`}
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              onClick={() => setActiveTab('finances')}
              className="text-rose-600 hover:text-rose-700 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <span>Ver Ganancias por Lugar</span>
              <span>→</span>
            </button>
          </div>
        </div>

        {/* Card 4: Tasa de Ocupación Real */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>TASA DE OCUPACIÓN REAL</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              • {financialMetrics.confirmedCount} Reservas
            </span>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {selectedSpace && financialMetrics.bySpace[selectedSpace.id]
                ? `${financialMetrics.bySpace[selectedSpace.id].occupancyPct}%`
                : `${financialMetrics.realOccupancyPct}%`}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 truncate">
              {selectedSpace && financialMetrics.bySpace[selectedSpace.id]
                ? `${financialMetrics.bySpace[selectedSpace.id].confirmedCount} reservas en ${selectedSpace.title}`
                : `${financialMetrics.totalBookedUnits} jornadas reservadas en total`}
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 text-[11px] font-medium">
              Total cartera: {financialMetrics.realOccupancyPct}%
            </span>
          </div>
        </div>
      </div>

      {/* Pestañas del Dashboard */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('calendar')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'calendar'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Calendario y Disponibilidad
        </button>

        <button
          onClick={() => setActiveTab('spaces')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'spaces'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building className="w-4 h-4" />
          Mis Espacios ({mySpaces.length})
        </button>

        <button
          onClick={() => setActiveTab('bookings')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'bookings'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          Solicitudes y Reservas ({myReceivedBookings.length})
        </button>

        <button
          onClick={() => setActiveTab('finances')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'finances'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Métricas Financieras
        </button>

        <button
          onClick={() => setActiveTab('visits')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'visits'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <MapPin className="w-4 h-4" />
          Visitas Técnicas ({upcomingVisitRequests.length})
        </button>
      </div>

      {/* Contenido según Pestaña */}
      {activeTab === 'spaces' && (
        <div className="space-y-4">
          {mySpaces.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
              <Building className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">Aún no has publicado ningún espacio</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Comienza publicando tu primera oficina, estudio o sala para empezar a recibir solicitudes de clientes en Chile.
              </p>
              <button
                onClick={() => setIsPublishModalOpen(true)}
                className="mt-2 px-5 py-2.5 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700 transition inline-flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" /> Publicar Mi Primer Espacio
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
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
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
                          ? 'En Moderación'
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
                        <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap shrink-0">
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
                              <span className="font-extrabold text-slate-900 text-sm">
                                {formatClp(rate.amount)}
                              </span>
                              <span className="text-slate-400 font-medium"> {rate.unitLabel}</span>
                            </div>
                          );
                        })()}
                        <span className="text-[11px] text-slate-500 whitespace-nowrap">
                          Garantía: <strong className="text-slate-700">{formatClp(space.securityDeposit || 100000)}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => {
                            setSelectedSpaceId(space.id);
                            setActiveTab('calendar');
                          }}
                          className="flex-1 min-w-[115px] px-2.5 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
                          title="Gestionar disponibilidad y solicitudes de este recinto en el calendario"
                        >
                          <Calendar className="w-3 h-3 text-indigo-600 shrink-0" />
                          <span>Calendario</span>
                        </button>
                        <button
                          onClick={() => handleStartEdit(space)}
                          className="flex-1 min-w-[95px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
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
                          className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-[11px] cursor-pointer whitespace-nowrap"
                        >
                          {space.status === 'active' ? 'Pausar' : 'Activar'}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('¿Eliminar este espacio?')) deleteSpace(space.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer shrink-0"
                          title="Eliminar Espacio"
                        >
                          <Trash2 className="w-4 h-4" />
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
                  Solicitudes Recibidas de Arrendatarios
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Aprobación: Hoy ({todayIso}) en adelante
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Revisa los antecedentes del cliente, las fechas solicitadas, el recinto exacto y el contrato digital generado.
              </p>
            </div>

            {/* Selector para filtrar reservas por recinto específico */}
            <div className="flex items-center gap-2">
              <label htmlFor="filter-bookings-space" className="text-xs font-bold text-slate-500 whitespace-nowrap">
                Filtrar por Recinto:
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
            <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap mr-1">Estado:</span>
            <button
              type="button"
              onClick={() => setBookingListStatusFilter('pending_valid')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                bookingListStatusFilter === 'pending_valid'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              ⚡ Por Aprobar ({pendingValidBookings.length})
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
              Pasadas / Expiradas ({myReceivedBookings.filter((b) => b.startDate < todayIso).length})
            </button>
          </div>

          {(() => {
            let displayedBookings = selectedSpaceId
              ? myReceivedBookings.filter((b) => b.spaceId === selectedSpaceId)
              : myReceivedBookings;

            if (bookingListStatusFilter === 'pending_valid') {
              displayedBookings = displayedBookings.filter(
                (b) => b.status === 'pending' && b.startDate >= todayIso
              );
            } else if (bookingListStatusFilter === 'confirmed') {
              displayedBookings = displayedBookings.filter((b) => b.status === 'confirmed');
            } else if (bookingListStatusFilter === 'past') {
              displayedBookings = displayedBookings.filter((b) => b.startDate < todayIso);
            }

            if (displayedBookings.length === 0) {
              return (
                <div className="p-12 text-center text-slate-400 text-xs">
                  <Clock className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  No hay solicitudes de reserva para el filtro seleccionado.
                </div>
              );
            }

            return (
              <div className="divide-y divide-slate-100">
                {displayedBookings.map((res) => {
                  const isPast = res.startDate < todayIso;
                  const canApprove = res.status === 'pending' && !isPast;

                  return (
                    <div key={res.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 transition">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-400">#{res.id.slice(-6)}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              res.status === 'confirmed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : res.status === 'pending'
                                ? isPast
                                  ? 'bg-slate-100 text-slate-700 border border-slate-300'
                                  : 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {res.status === 'confirmed'
                              ? 'Aceptada / Confirmada'
                              : res.status === 'pending'
                              ? isPast
                                ? 'Expirada (Fecha anterior a hoy)'
                                : 'Esperando tu Respuesta (Vigente)'
                              : 'Rechazada'}
                          </span>

                          {/* Etiqueta explícita del recinto solicitado */}
                          <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1">
                            <Building className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Recinto: {res.spaceTitle}</span>
                          </span>

                          {isPast && (
                            <span className="text-[10px] text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded">
                              Fecha Pasada
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span>Cliente: <strong className="text-slate-900">{res.tenantName}</strong></span>
                          <span>RUT: <strong className="text-slate-900">{formatRut(res.tenantRut)}</strong></span>
                          <span>
                            Fechas: <strong>{res.startDate}</strong> al <strong>{res.endDate}</strong> ({res.durationUnits ? `${res.durationUnits} hrs` : `${res.totalDays} días`})
                          </span>
                          <span>Subtotal Propietario: <strong className="text-emerald-700 font-bold">{formatClp(res.subtotalClp)}</strong></span>
                          {res.intendedUse && (
                            <span className="w-full text-slate-500 italic mt-0.5">
                              Uso previsto: "{res.intendedUse}"
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
                          <span>Descargar Reserva</span>
                        </button>

                        {/* Botón para ver el contrato legal digital siempre accesible */}
                        <button
                          onClick={() => handleViewReservationContract(res)}
                          className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                          title="Ver y revisar el contrato legal digital (Ley 18.101 & 19.799)"
                        >
                          <FileText className="w-4 h-4 text-rose-600" />
                          <span>Ver Contrato</span>
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
                            const generated = generateDigitalContract({
                              reservationId: res.id,
                              spaceTitle: res.spaceTitle,
                              spaceAddress: res.spaceAddress,
                              tenantName: res.tenantName,
                              tenantRut: res.tenantRut,
                              ownerName: res.ownerName,
                              ownerRut: res.ownerRut || currentUser?.rut || '14.258.963-7',
                              totalClp: res.totalClp,
                              guaranteeDepositClp: res.securityDepositClp,
                              startDate: res.startDate,
                              endDate: res.endDate,
                              ip: '200.89.68.114',
                              priceUnit: res.priceUnit || 'day',
                              rentalModality: res.rentalModality || 'por_dia',
                              durationUnits: res.durationUnits || res.totalDays || 1,
                              hourStart: res.hourStart,
                              hourEnd: res.hourEnd,
                              intendedUse: res.intendedUse,
                            });
                            downloadContractDocument(generated);
                          }}
                          className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                          title="Descargar contrato digital"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Descargar Contrato</span>
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
                                    if (res.startDate < todayIso) {
                                      alert('Las reservas para aprobar deben ser del día actual hacia adelante.');
                                      return;
                                    }
                                    updateReservationStatus(res.id, 'confirmed');
                                  }}
                                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 transition shadow-xs cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Aceptar Arriendo</span>
                                </button>
                                <button
                                  onClick={() => {
                                    if (res.startDate < todayIso) {
                                      alert('No se pueden modificar solicitudes con fecha anterior a hoy.');
                                      return;
                                    }
                                    updateReservationStatus(res.id, 'rejected');
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
                                <Lock className="w-3.5 h-3.5 text-slate-400" />
                                <span>Historial (Solo Lectura)</span>
                              </span>
                            )}
                          </>
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

      {/* Pestaña: Métricas Financieras Reales por Lugar */}
      {activeTab === 'finances' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 space-y-5 shadow-xs">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Desglose Real de Ganancias y Liquidaciones (CLP)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Calculado directamente a partir de tus {financialMetrics.confirmedCount} reservas confirmadas.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-600">
                    Total Facturación Bruta Arriendos ({financialMetrics.confirmedCount} reservas confirmadas)
                  </span>
                  <span className="text-sm font-bold text-slate-900">{formatClp(financialMetrics.grossIncome)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-600">Comisión Spotly retenida (5%)</span>
                  <span className="text-sm font-bold text-rose-600">-{formatClp(financialMetrics.platformFeesPaid)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-600">Garantías de Arrendatarios en Custodia</span>
                  <span className="text-sm font-bold text-indigo-600">{formatClp(financialMetrics.depositsHeld)}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                  <div>
                    <span className="text-xs font-bold text-emerald-950 block">Ganancia Neta Real Acumulada</span>
                    <span className="text-[11px] text-emerald-700">Suma neta real de todos tus lugares arrendados</span>
                  </div>
                  <span className="text-xl font-extrabold text-emerald-700">{formatClp(financialMetrics.netPayout)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900">Régimen Tributario & Cumplimiento</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                De acuerdo con la Circular N° 37 del SII y la Ley 18.101, los arriendos de inmuebles amoblados o con instalaciones que permitan el ejercicio de una actividad comercial están afectos al Impuesto al Valor Agregado (IVA - 19%).
              </p>
              <div className="p-3.5 bg-slate-50 rounded-2xl text-xs space-y-1 text-slate-700">
                <div className="font-bold text-slate-900">Emisión de Boleta/Factura:</div>
                <div>RUT Emisor: {formatRut(currentUser.rut)}</div>
                <div>Titular: {currentUser.fullName}</div>
              </div>
            </div>
          </div>

          {/* Desglose Real por cada Lugar del Propietario */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-xs">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Ganancias Reales por Lugar / Recinto
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Ingresos reales generados por cada uno de tus espacios según sus reservas confirmadas.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {financialMetrics.spaceBreakdownList.map((spMetric) => (
                <div
                  key={spMetric.spaceId}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3 flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{spMetric.spaceTitle}</h4>
                      <p className="text-[11px] text-slate-500">
                        {spMetric.commune} • {spMetric.confirmedCount} reservas confirmadas
                        {spMetric.pendingCount > 0 ? ` • ${spMetric.pendingCount} por aprobar` : ''}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        spMetric.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {spMetric.status === 'active' ? 'Activo' : 'En Moderación'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Bruto</span>
                      <span className="font-bold text-slate-800">{formatClp(spMetric.grossIncome)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Comisión (5%)</span>
                      <span className="font-bold text-rose-600">-{formatClp(spMetric.platformFeesPaid)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Ganancia Neta</span>
                      <span className="font-extrabold text-emerald-700">{formatClp(spMetric.netPayout)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
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
                  <label htmlFor="owner-space-selector" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Recinto en Gestión
                  </label>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">
                    {spaceModalityLabel}
                  </span>
                  {selectedSpace && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                      ● Activo
                    </span>
                  )}
                </div>
                {selectedSpace && (
                  <span className="text-[11px] text-slate-500 font-medium truncate">
                    {selectedSpace.address}, {selectedSpace.commune}
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
                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Fecha Pasada (Solo Lectura)</span>
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
                      <span>+ Bloquear Mantención</span>
                    </button>
                  )}
                  {selectedSpace && (
                    <button
                      type="button"
                      onClick={() => handleStartEdit(selectedSpace)}
                      className="flex-1 sm:flex-initial justify-center px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer whitespace-nowrap"
                    >
                      <Pencil className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>Editar Tarifas y Ficha</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Fila 3: Resumen compacto de características y tarifas del recinto */}
              {selectedSpace && (
                <div className="pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>
                      Capacidad: <strong className="text-slate-900">{selectedSpace.capacity} personas</strong>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>
                      Superficie: <strong className="text-slate-900">{selectedSpace.surfaceM2} m²</strong>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>
                      Horario: <strong className="text-slate-900">{selectedSpace.openingHours || 'Lun-Vie 08:30-20:30'}</strong>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {selectedSpace.pricePerHour ? (
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-semibold">
                        Hora: <strong className="text-slate-950">{formatClp(selectedSpace.pricePerHour)}</strong>
                      </span>
                    ) : null}
                    {selectedSpace.pricePerDay ? (
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-semibold">
                        Día: <strong className="text-slate-950">{formatClp(selectedSpace.pricePerDay)}</strong>
                      </span>
                    ) : null}
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                      Garantía: <strong>{formatClp(selectedSpace.securityDeposit || 100000)}</strong>
                    </span>
                  </div>
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
                    alert('No se pueden aprobar ni modificar reservas de fechas pasadas.');
                    return;
                  }
                  updateReservationStatus(resId, 'confirmed');
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
                  Aún no tienes recintos publicados para mostrar en el calendario
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Publica tu primer espacio para habilitar su calendario de disponibilidad horaria, bloqueos de mantención y recepción de reservas.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (currentUser.verificationStatus !== 'verified') {
                      alert('Debes completar la verificación de identidad y contar con la aprobación del Administrador antes de publicar espacios.');
                      return;
                    }
                    setIsPublishModalOpen(true);
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Publicar Nuevo Espacio</span>
                </button>
              </div>
            )}

            {/* Ficha Resumen del Recinto Seleccionado (Bottom Card) */}
            {selectedSpace && (
              <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 overflow-hidden">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <img
                    src={selectedSpace.images[0] || 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=400&q=80'}
                    alt={selectedSpace.title}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-slate-200 shadow-2xs shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                        {selectedSpace.title}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                        Activo
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {selectedSpace.address}, {selectedSpace.commune} • Capacidad: {selectedSpace.capacity} pers • {selectedSpace.surfaceM2} m²
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-700 flex-wrap">
                      <span>Tarifa base: <strong className="text-slate-900">{formatClp(selectedSpace.pricePerHour || selectedSpace.pricePerDay || 45000)}</strong></span>
                      <span className="text-slate-300">•</span>
                      <span>Garantía: <strong className="text-slate-900">{formatClp(selectedSpace.securityDeposit || 100000)}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap justify-end">
                  <button
                    onClick={() => handleStartEdit(selectedSpace)}
                    className="flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer whitespace-nowrap"
                  >
                    <Pencil className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span>Editar Ficha</span>
                  </button>
                  <button
                    onClick={() => alert(`Vista pública de ${selectedSpace.title} disponible en el catálogo de Spotly.`)}
                    className="flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>Vista Pública</span>
                  </button>
                </div>
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
                    <h3 className="text-sm font-extrabold text-slate-900">Solicitudes por Aprobar</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">
                      {pendingValidBookings.length} Vigentes
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Solo solicitudes válidas del día actual hacia adelante ({todayIso} en adelante).
                  </p>
                </div>
              </div>

              {/* Filtro rápido: Todas vs Solo del recinto seleccionado */}
              {selectedSpace && (
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl text-[11px] font-bold text-slate-600">
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
                    Solo este recinto
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
                      <div className="p-8 text-center text-slate-400 text-xs">
                        <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        No hay solicitudes vigentes pendientes por aprobar.
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
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 whitespace-nowrap shrink-0">
                          Expira en 4h
                        </span>
                      </div>

                      {/* Datos del Cliente */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0 group-hover:bg-indigo-900 transition">
                          {res.tenantName.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-slate-900 truncate">{res.tenantName}</h4>
                          <p className="text-[11px] text-slate-500 truncate">
                            RUT: {formatRut(res.tenantRut)} • {res.tenantEmail}
                          </p>
                        </div>
                      </div>

                      {/* Detalles del Arriendo Solicitado */}
                      <div className="p-3 rounded-xl bg-white text-[11px] space-y-1.5 text-slate-700 border border-slate-100 shadow-2xs group-hover:border-indigo-100 transition">
                        <div className="flex items-center justify-between gap-1.5 font-semibold text-slate-900">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <CalendarIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span className="font-bold truncate">
                              {res.startDate} {res.durationUnits ? `• ${res.durationUnits} hrs (${res.hourStart ?? 9}:00-${res.hourEnd ?? (res.hourStart ?? 9) + (res.durationUnits || 4)}:00)` : `• ${res.totalDays} días`}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-indigo-600 whitespace-nowrap shrink-0">
                            Ver fecha ↗
                          </span>
                        </div>
                        <p className="text-slate-600 line-clamp-2">
                          <strong className="text-slate-800">Motivo:</strong> {res.intendedUse}
                        </p>
                        <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between font-bold">
                          <span className="text-slate-500 font-medium">Monto neto anfitrión:</span>
                          <span className="text-emerald-700 font-extrabold text-xs">
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
                            className="py-2 px-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold text-[11px] flex items-center justify-center gap-1 transition shadow-2xs cursor-pointer whitespace-nowrap"
                            title="Ver contrato digital formal para este arriendo"
                          >
                            <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>Ver Contrato</span>
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
                            className="py-2 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
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
                              alert('Las reservas para aprobar deben ser del día actual hacia adelante.');
                              return;
                            }
                            updateReservationStatus(res.id, 'confirmed');
                          }}
                          className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Aprobar Solicitud Ahora</span>
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
                    <h3 className="text-xs font-bold text-slate-900">Visitas Técnicas (Scouting)</h3>
                    <p className="text-[10px] text-slate-500">Vigentes desde hoy ({todayIso}) en adelante</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {upcomingVisitRequests.length} {upcomingVisitRequests.length === 1 ? 'Agendada' : 'Agendadas'}
                </span>
              </div>

              <div className="space-y-2.5">
                {upcomingVisitRequests.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs bg-slate-50/70 rounded-2xl border border-slate-100">
                    <Users className="w-7 h-7 mx-auto mb-1.5 text-slate-300" />
                    No hay visitas técnicas pendientes desde hoy en adelante. Las visitas con fecha pasada se ocultan automáticamente.
                  </div>
                ) : (
                  upcomingVisitRequests.map((visit) => (
                    <div
                      key={visit.id}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{visit.tenantName}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          Gratuita (30m)
                        </span>
                      </div>
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-semibold text-slate-700">
                        <MapPin className="w-3 h-3 text-rose-500" />
                        <span>{visit.spaceTitle}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 flex items-center gap-2">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{visit.visitDate} • {visit.visitTimeSlot}</span>
                      </div>
                      {visit.notes && (
                        <p className="text-[11px] text-slate-500 italic bg-white p-2 rounded-xl border border-slate-100">
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
                          className="flex-1 py-1.5 px-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-[10px] text-center transition cursor-pointer"
                        >
                          Contactar por WhatsApp
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Card 3: Ganancias Reales por Lugar */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Banknote className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Ganancias Reales por Lugar</h3>
                    <p className="text-[10px] text-slate-500">Ingresos netos reales según reservas confirmadas</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('finances')}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                >
                  Ver Detalle
                </button>
              </div>

              <div className="space-y-2.5 divide-y divide-slate-100">
                {financialMetrics.spaceBreakdownList.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">
                    Sin espacios publicados aún.
                  </p>
                ) : (
                  financialMetrics.spaceBreakdownList.map((spMetric) => {
                    const isCurrent = selectedSpace?.id === spMetric.spaceId;
                    return (
                      <div
                        key={spMetric.spaceId}
                        onClick={() => setSelectedSpaceId(spMetric.spaceId)}
                        className={`pt-2.5 flex items-center justify-between text-xs cursor-pointer rounded-xl px-2 py-1.5 transition ${
                          isCurrent ? 'bg-emerald-50/70 border border-emerald-200' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-900 truncate">{spMetric.spaceTitle}</p>
                          <p className="text-[10px] text-slate-500">
                            {spMetric.commune} • {spMetric.confirmedCount} {spMetric.confirmedCount === 1 ? 'reserva confirmada' : 'reservas confirmadas'}
                          </p>
                        </div>
                        <span className="font-extrabold text-emerald-700 shrink-0">
                          {formatClp(spMetric.netPayout)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-3 rounded-xl bg-slate-900 text-white text-xs flex items-center justify-between">
                <span className="font-semibold text-slate-300">Total Neto Acumulado:</span>
                <span className="font-extrabold text-emerald-400 text-sm">
                  {formatClp(financialMetrics.netPayout)}
                </span>
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
              Solicitudes de Visita Recibidas
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Personas interesadas que desean conocer tus espacios presencialmente o de forma virtual antes de arrendar.
            </p>
          </div>

          {(() => {
            const myVisits = upcomingVisitRequests;
            if (myVisits.length === 0) {
              return (
                <div className="p-12 text-center text-slate-400 text-xs">
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
                          <span className="font-mono text-xs font-bold text-slate-400">#{visit.id.slice(-6)}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
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
                          <span>Modalidad: <strong>{visit.modality === 'presencial' ? '🏢 Presencial' : '💻 Virtual'}</strong></span>
                          <span>Asistentes: <strong>{visit.attendeesCount}</strong></span>
                        </div>

                        {visit.notes && (
                          <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-2 border border-slate-200">
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

      {/* Modal para Publicar o Modificar Espacio */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
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
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  {editingSpace ? 'Modificación de Inmueble' : 'Alta de Inmuebles en Chile'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Ley N° 18.101</span>
              </div>
              <h2 className="text-xl font-bold">
                {editingSpace ? `Modificar Espacio: ${editingSpace.title}` : 'Publicar Nuevo Espacio en Spotly'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {editingSpace
                  ? 'Actualiza los precios por hora, día o mes, descripción y fotografías de tu espacio.'
                  : 'Configura los datos del recinto, sube fotografías reales, define el entorno y los términos de arriendo.'}
              </p>
            </div>

            <form onSubmit={handlePublishSpace} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* TÍTULO Y AMBIENTE */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Título del Espacio <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="ej. Planta Libre Corporativa con Terraza en El Golf"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden font-medium"
                  required
                />
              </div>

              {/* TIPO DE ENTORNO: ABIERTO VS CERRADO */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tipo de Entorno del Espacio <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewEnvironment('cerrado')}
                    className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 ${
                      newEnvironment === 'cerrado'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-rose-500/30'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <Building className={`w-5 h-5 flex-shrink-0 mt-0.5 ${newEnvironment === 'cerrado' ? 'text-rose-400' : 'text-slate-500'}`} />
                    <div>
                      <div className="text-xs font-bold flex items-center gap-1.5">
                        <span>Techado / Cerrado</span>
                        {newEnvironment === 'cerrado' && <Check className="w-3.5 h-3.5 text-rose-400" />}
                      </div>
                      <p className={`text-[11px] mt-0.5 leading-relaxed ${newEnvironment === 'cerrado' ? 'text-slate-300' : 'text-slate-500'}`}>
                        Oficinas privadas, salas de directorio, auditorios, coworking y locales comerciales techados.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewEnvironment('abierto')}
                    className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 ${
                      newEnvironment === 'abierto'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-emerald-500/30'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <Sun className={`w-5 h-5 flex-shrink-0 mt-0.5 ${newEnvironment === 'abierto' ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <div>
                      <div className="text-xs font-bold flex items-center gap-1.5">
                        <span>Al Aire Libre / Abierto</span>
                        {newEnvironment === 'abierto' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                      <p className={`text-[11px] mt-0.5 leading-relaxed ${newEnvironment === 'abierto' ? 'text-slate-300' : 'text-slate-500'}`}>
                        Terrazas corporativas, azoteas panorámicas (rooftops), patios exteriores y jardines para eventos.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* CATEGORÍA Y COMUNA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Categoría</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as SpaceCategory)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden font-medium"
                  >
                    <option value="office">Oficina Privada</option>
                    <option value="cowork">Coworking</option>
                    <option value="event">Eventos & Workshops</option>
                    <option value="studio">Estudio Creativo</option>
                    <option value="warehouse">Bodega Urbana</option>
                    <option value="retail">Comercial / Retail</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Comuna</label>
                  <select
                    value={newCommune}
                    onChange={(e) => setNewCommune(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden font-medium"
                  >
                    {CHILEAN_COMMUNES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Dirección Exacta</label>
                <input
                  type="text"
                  placeholder="ej. Av. Apoquindo 4500, Oficina 802, Las Condes"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden font-medium"
                  required
                />
              </div>

              {/* SELECTOR VISUAL DE MODALIDAD (POR HORA, POR DÍA, POR MES, ABIERTO A TODO) */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  Modalidad de Arriendo y Tarifas
                </label>
                <RentalModalitySelector
                  enableHourly={enableHourly}
                  onEnableHourlyChange={setEnableHourly}
                  hourlyPrice={hourlyPrice}
                  onHourlyPriceChange={setHourlyPrice}
                  hourlyMinHours={hourlyMinHours}
                  onHourlyMinHoursChange={setHourlyMinHours}
                  hourlyInstantBooking={hourlyInstantBooking}
                  onHourlyInstantBookingChange={setHourlyInstantBooking}

                  enableDaily={enableDaily}
                  onEnableDailyChange={setEnableDaily}
                  dailyPrice={dailyPrice}
                  onDailyPriceChange={setDailyPrice}
                  dailyOpeningHours={dailyOpeningHours}
                  onDailyOpeningHoursChange={setDailyOpeningHours}

                  enableMonthly={enableMonthly}
                  onEnableMonthlyChange={setEnableMonthly}
                  monthlyPrice={monthlyPrice}
                  onMonthlyPriceChange={setMonthlyPrice}
                  securityDeposit={newSecurityDeposit}
                  onSecurityDepositChange={setNewSecurityDeposit}

                  computedModality={computedRentalModality}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Capacidad Máxima (personas) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newCapacity === 0 ? '' : newCapacity}
                    placeholder="Ej: 25"
                    onChange={(e) => {
                      setNewCapacity(parsePositiveIntInput(e.target.value));
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Superficie Total (m²) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newSurfaceM2 === 0 ? '' : newSurfaceM2}
                    placeholder="Ej: 120"
                    onChange={(e) => {
                      setNewSurfaceM2(parsePositiveIntInput(e.target.value));
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Garantía en Custodia ($ CLP) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-xs font-bold text-slate-500">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={newSecurityDeposit === 0 ? '' : newSecurityDeposit}
                      placeholder="Ej: 150000"
                      onChange={(e) => {
                        setNewSecurityDeposit(parsePositiveIntInput(e.target.value));
                      }}
                      className="w-full pl-7 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden font-semibold"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* HORARIO DE OPERACIÓN CON MENÚS DESPLEGABLES */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800">
                    Horario de Operación y Disponibilidad
                  </label>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white border border-slate-200 text-slate-700">
                    {operationDays === '24/7'
                      ? 'Lun-Dom 00:00-24:00 (24/7)'
                      : `${operationDays} ${operationStartHour}-${operationEndHour}`}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Días de Disponibilidad
                    </label>
                    <select
                      value={operationDays}
                      onChange={(e) => {
                        const nextDays = e.target.value;
                        setOperationDays(nextDays);
                        const formatted =
                          nextDays === '24/7'
                            ? 'Lun-Dom 00:00-24:00 (24/7)'
                            : `${nextDays} ${operationStartHour}-${operationEndHour}`;
                        setNewOpeningHours(formatted);
                      }}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden font-semibold text-slate-800 cursor-pointer"
                    >
                      {AVAILABILITY_DAY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Hora de Apertura
                    </label>
                    <select
                      value={operationStartHour}
                      disabled={operationDays === '24/7'}
                      onChange={(e) => {
                        const nextStart = e.target.value;
                        setOperationStartHour(nextStart);
                        setDailyOpeningHours(`${nextStart} - ${operationEndHour}`);
                        setNewOpeningHours(`${operationDays} ${nextStart}-${operationEndHour}`);
                      }}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden font-semibold text-slate-800 cursor-pointer disabled:opacity-50"
                    >
                      {OPERATION_HOUR_OPTIONS.map((h) => (
                        <option key={`op-start-${h}`} value={h}>
                          {h} hrs
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Hora de Cierre
                    </label>
                    <select
                      value={operationEndHour}
                      disabled={operationDays === '24/7'}
                      onChange={(e) => {
                        const nextEnd = e.target.value;
                        setOperationEndHour(nextEnd);
                        setDailyOpeningHours(`${operationStartHour} - ${nextEnd}`);
                        setNewOpeningHours(`${operationDays} ${operationStartHour}-${nextEnd}`);
                      }}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden font-semibold text-slate-800 cursor-pointer disabled:opacity-50"
                    >
                      {OPERATION_HOUR_OPTIONS.map((h) => (
                        <option key={`op-end-${h}`} value={h}>
                          {h} hrs
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Descripción Detallada</label>
                <textarea
                  rows={3}
                  placeholder="Describe la conectividad, vistas panorámicas, luz natural, climatización, seguridad..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>

              {/* SECCIÓN DE CARGA Y GESTIÓN DE IMÁGENES */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-rose-600" />
                      Fotografías del Espacio ({newImages.length})
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Sube fotos reales del espacio desde tu dispositivo.
                    </p>
                  </div>
                </div>

                {/* Subir archivo desde disco */}
                <div className="grid grid-cols-1 gap-2">
                  <label className="flex items-center justify-center gap-2 p-3 bg-white border-2 border-dashed border-slate-300 hover:border-rose-500 rounded-xl cursor-pointer text-xs font-semibold text-slate-700 hover:text-rose-600 transition">
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span>Cargar imágenes desde mi equipo</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleAddFiles}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Previsualización de imágenes añadidas */}
                {newImages.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                    {newImages.map((imgUrl, idx) => (
                      <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                        <img
                          src={imgUrl}
                          alt={`Foto ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {idx === 0 && (
                          <span className="absolute top-1 left-1 bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                            Principal
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute top-1 right-1 bg-black/70 hover:bg-rose-600 text-white p-1 rounded-md opacity-0 group-hover:opacity-100 transition"
                          title="Eliminar foto"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AMENIDADES SELECCIONABLES CON UN CLICK */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Amenidades e Instalaciones (Haz clic para activar)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_AMENITIES.map((amenity) => {
                    const isSelected = selectedAmenities.includes(amenity);
                    return (
                      <button
                        type="button"
                        key={amenity}
                        onClick={() => handleToggleAmenity(amenity)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {isSelected ? <Check className="w-3.5 h-3.5" /> : <PlusCircle className="w-3.5 h-3.5 text-slate-400" />}
                        {amenity}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* REGLAS DEL INMUEBLE SELECCIONABLES */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Reglas y Condiciones del Recinto
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_RULES.map((rule) => {
                    const isSelected = selectedRules.includes(rule);
                    return (
                      <button
                        type="button"
                        key={rule}
                        onClick={() => handleToggleRule(rule)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {isSelected ? <Check className="w-3.5 h-3.5 text-rose-400" /> : <PlusCircle className="w-3.5 h-3.5 text-slate-400" />}
                        {rule}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* BOTONES DE ACCIÓN */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsPublishModalOpen(false);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition flex items-center gap-2"
                >
                  {editingSpace ? (
                    <>
                      <Check className="w-4 h-4" />
                      Guardar Cambios del Espacio
                    </>
                  ) : (
                    <>
                      <PlusCircle className="w-4 h-4" />
                      Publicar Espacio en el Catálogo
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Bloqueo por Mantención */}
      {isMaintenanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Bloquear Fecha por Mantención</h3>
                  <p className="text-[11px] text-slate-500">Recinto: {selectedSpace?.title}</p>
                </div>
              </div>
              <button
                onClick={() => setIsMaintenanceModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddMaintenanceBlock} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Fecha a Bloquear (Desde hoy {todayIso} en adelante)
                </label>
                <input
                  type="date"
                  min={todayIso}
                  value={maintenanceDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && val < todayIso) {
                      alert(`Solo puedes bloquear fechas desde hoy (${todayIso}) hacia adelante.`);
                      setMaintenanceDate(todayIso);
                      return;
                    }
                    setMaintenanceDate(val);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Las fechas anteriores a hoy pertenecen al historial y no pueden ser bloqueadas ni modificadas.
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Motivo del Bloqueo</label>
                <input
                  type="text"
                  value={maintenanceReason}
                  onChange={(e) => setMaintenanceReason(e.target.value)}
                  placeholder="Ej: Sanitización, pintura o mantención técnica"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  required
                />
              </div>

              {/* Lista de bloqueos actuales para este espacio */}
              {maintenanceBlocks.filter((m) => m.spaceId === selectedSpace?.id).length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <label className="font-bold text-slate-600 block text-[11px]">Bloqueos registrados en este recinto:</label>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {maintenanceBlocks
                      .filter((m) => m.spaceId === selectedSpace?.id)
                      .map((block) => {
                        const isPastBlock = block.date < todayIso;
                        return (
                          <div
                            key={block.id}
                            className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px]"
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-800">{block.date}</span>
                                {isPastBlock && (
                                  <span className="px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 text-[9px] font-bold">
                                    Histórico
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-500 truncate max-w-[200px]">{block.reason}</p>
                            </div>
                            {isPastBlock ? (
                              <span className="text-slate-400 font-semibold text-[10px] px-2 py-0.5 flex items-center gap-1">
                                <Lock className="w-3 h-3" />
                                Solo lectura
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRemoveMaintenanceBlock(block.id)}
                                className="text-rose-600 hover:text-rose-800 font-bold px-2 py-0.5 rounded cursor-pointer"
                              >
                                Desbloquear
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsMaintenanceModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold cursor-pointer transition shadow-xs"
                >
                  Confirmar Bloqueo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Contactar al Arrendatario */}
      {contactModalTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Contactar Arrendatario</h3>
                  <p className="text-[11px] text-slate-500">Recinto: {contactModalTenant.spaceTitle}</p>
                </div>
              </div>
              <button
                onClick={() => setContactModalTenant(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900">{contactModalTenant.name}</div>
                <div className="text-slate-600">Email: {contactModalTenant.email}</div>
                <div className="text-slate-600">Teléfono móvil: {contactModalTenant.phone}</div>
              </div>

              <p className="text-slate-500 leading-relaxed">
                Puedes enviar un mensaje directo por WhatsApp o realizar una llamada telefónica para coordinar detalles del evento, equipamiento requerido o solicitar documentos adicionales.
              </p>

              <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={() => {
                    alert(`Iniciando chat de WhatsApp con ${contactModalTenant.name} (${contactModalTenant.phone}) sobre ${contactModalTenant.spaceTitle}`);
                    setContactModalTenant(null);
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Abrir WhatsApp</span>
                </button>
                <button
                  onClick={() => setContactModalTenant(null)}
                  className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
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
                <p className="text-[11px] text-slate-500">{selectedSpace?.title}</p>
              </div>
              <button
                onClick={() => setSelectedDayInfo(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {(() => {
                const { booking, visit, maintenance } = getDayEventsForSelectedSpace(selectedDayInfo.date);

                if (booking) {
                  const isPastBooking = booking.startDate < todayIso;
                  return (
                    <div className="p-4 rounded-2xl bg-rose-50/90 border border-rose-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {booking.status === 'confirmed' ? '✓ Reserva Confirmada' : '⚡ Solicitud Pendiente'}
                        </span>
                        <span className="font-extrabold text-rose-700 text-sm">{formatClp(booking.subtotalClp)}</span>
                      </div>

                      {/* DETALLE EXACTO DE DÍA, HORA O MES SOLICITADO */}
                      <div className="p-3 bg-white rounded-xl border border-rose-100 space-y-2">
                        <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                          {booking.rentalModality === 'por_hora' || booking.hourStart !== undefined ? (
                            <>
                              <Clock className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Horario Solicitado: <strong>{booking.hourStart ?? 10}:00 a {booking.hourEnd ?? 14}:00 hrs</strong> ({booking.durationUnits || booking.totalDays || 4} hrs)</span>
                            </>
                          ) : booking.rentalModality === 'mensual' ? (
                            <>
                              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Mes Solicitado: <strong>{booking.rentalMonth || 'Septiembre 2026'}</strong></span>
                            </>
                          ) : (
                            <>
                              <CalendarIcon className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Jornada Completa: <strong>{booking.startDate} al {booking.endDate}</strong> ({booking.totalDays} {booking.totalDays === 1 ? 'día' : 'días'})</span>
                            </>
                          )}
                        </div>

                        <div className="flex items-start gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 p-2 rounded-lg">
                          <Lock className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                          <span>Bloqueo Activo: Esta franja/fecha está bloqueada en la plataforma para evitar dobles reservas con otros clientes.</span>
                        </div>
                      </div>

                      <div className="space-y-1 text-[11px] text-slate-700">
                        <p>Cliente: <strong>{booking.tenantName}</strong> (RUT: {booking.tenantRut || '18.345.678-9'})</p>
                        <p>Destino: <em>"{booking.intendedUse}"</em></p>
                      </div>

                      <div className="space-y-2 pt-1">
                        <button
                          onClick={() => {
                            setSelectedDayInfo(null);
                            handleViewReservationContract(booking);
                          }}
                          className="w-full py-2 rounded-xl bg-white border border-rose-200 text-rose-800 font-bold text-xs hover:bg-rose-100 transition cursor-pointer"
                        >
                          Ver Contrato Digital Ley 18.101
                        </button>

                        {booking.status === 'pending' && (
                          isPastBooking ? (
                            <div className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 font-bold text-[11px] text-center flex items-center justify-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                              <span>Registro Histórico • Sin modificaciones permitidas</span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <button
                                onClick={() => {
                                  if (booking.startDate < todayIso) {
                                    alert('Las reservas para aprobar deben ser del día actual hacia adelante.');
                                    return;
                                  }
                                  updateReservationStatus(booking.id, 'confirmed');
                                  setSelectedDayInfo(null);
                                }}
                                className="py-2 px-2 rounded-xl font-bold text-xs transition cursor-pointer text-center bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                              >
                                Aprobar Reserva
                              </button>
                              <button
                                onClick={() => {
                                  if (booking.startDate < todayIso) {
                                    alert('No se pueden modificar reservas de fechas pasadas.');
                                    return;
                                  }
                                  updateReservationStatus(booking.id, 'rejected');
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
                      <span className="font-bold text-indigo-900">Visita Técnica Agendada</span>
                      <p className="text-slate-700">Cliente: <strong>{visit.tenantName}</strong></p>
                      <p className="text-slate-600">Horario: {visit.visitTimeSlot}</p>
                    </div>
                  );
                }

                const isSelectedModalDayPast = selectedDayInfo.date < todayIso;

                if (maintenance) {
                  return (
                    <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-200 space-y-1.5">
                      <span className="font-bold text-slate-900">Bloqueo por Mantención</span>
                      <p className="text-slate-600">{maintenance.reason}</p>
                      {isSelectedModalDayPast ? (
                        <span className="text-slate-400 font-semibold text-[11px] flex items-center gap-1 pt-1">
                          <Lock className="w-3 h-3" />
                          Fecha pasada (Solo lectura)
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
                      {isSelectedModalDayPast ? 'Fecha Pasada (Sin Reservas)' : 'Día 100% Disponible'}
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      Tarifa vigente: {formatClp(selectedSpace?.pricePerHour || selectedSpace?.pricePerDay || 45000)}
                    </p>
                    {isSelectedModalDayPast ? (
                      <div className="w-full py-2 px-3 rounded-xl bg-slate-200 text-slate-500 font-bold text-xs flex items-center justify-center gap-1.5 cursor-not-allowed">
                        <Lock className="w-3.5 h-3.5" />
                        <span>Historial (No bloqueable)</span>
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
