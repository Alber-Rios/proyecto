import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Space, DigitalContract, VisitRequest } from '../types.ts';
import { calculateBookingAmounts } from '../utils/pricing.ts';
import { getCategoryLabel } from '../utils/spaceCategories.ts';
import { useApp } from '../context/AppContext.tsx';
import { formatClp, formatRut, getTodayIso, getOffsetDateIso } from '../utils/formatters.ts';
import { SignatureCanvas } from './SignatureCanvas.tsx';
import { CheckoutPaymentBox, AppliedDiscount, PaymentChoice } from './CheckoutPaymentBox.tsx';
import { saveBookingDraft } from '../utils/bookingDraft.ts';
import {
  Calendar as CalendarIcon,
  ShieldCheck,
  FileCheck2,
  AlertCircle,
  MapPin,
  Clock,
  Info,
  Users,
  CheckCircle2,
  Building2,
  Video,
  X,
  FileText,
  Lock,
  ChevronRight,
  ChevronLeft,
  UserCheck,
  RotateCcw,
  Check,
  CalendarCheck,
} from 'lucide-react';

interface BookingModalProps {
  space: Space | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (contract: DigitalContract) => void;
  onOpenAuth?: (mode: 'login' | 'register', notice?: string) => void;
  initialMode?: 'booking' | 'visit';
  initialStep?: 1 | 2;
  initialModality?: 'por_hora' | 'por_dia' | 'mensual';
  initialStartDate?: string;
  initialEndDate?: string;
  initialTimeSlots?: string[];
  initialIntendedUse?: string;
  hoursCount?: number;
  initialHourStart?: number;
  initialHourEnd?: number;
  initialSelectedMonth?: string;
  // Al volver de inscribir una tarjeta en Transbank se retoma la reserva ya firmada.
  initialSignature?: string | null;
  paymentNotice?: { ok: boolean; text: string } | null;
}


const POPULAR_USES = [
  'Reunión de equipo y coworking',
  'Producción audiovisual o fotografía',
  'Taller, curso o capacitación',
  'Evento corporativo privado',
  'Grabación de podcast o contenido',
  'Almacenamiento temporal de mercadería',
];

const TIME_SLOTS = [
  { id: '10:00 - 12:00', label: '10:00 - 12:00', period: 'Mañana' },
  { id: '12:00 - 15:00', label: '12:00 - 15:00', period: 'Mediodía' },
  { id: '15:00 - 18:00', label: '15:00 - 18:00', period: 'Tarde' },
  { id: '18:00 - 20:00', label: '18:00 - 20:00', period: 'Vespertino' },
];

export const BookingModal: React.FC<BookingModalProps> = ({
  space,
  isOpen,
  onClose,
  onSuccess,
  onOpenAuth,
  initialMode = 'booking',
  initialStep = 1,
  initialModality,
  initialStartDate,
  initialEndDate,
  initialTimeSlots,
  initialIntendedUse,
  hoursCount,
  initialHourStart = 10,
  initialHourEnd = 14,
  initialSelectedMonth = '2026-10',
  initialSignature = null,
  paymentNotice = null,
}) => {
  const { currentUser, createBooking, startWebpayPayment, payWithWalletCard, addWalletCard, requestVisit } = useApp();
  const [discount, setDiscount] = useState<AppliedDiscount | null>(null);
  const navigate = useNavigate();

  // Modo activo: 'booking' (Reserva formal) o 'visit' (Solicitud de visita)
  const [activeMode, setActiveMode] = useState<'booking' | 'visit'>(initialMode);

  // Pasos de Reserva: 1 = Contrato Digital Ley 18.101, 2 = Pago Seguro Webpay
  const [bookingStep, setBookingStep] = useState<1 | 2>(initialStep || 1);

  // Fechas de reserva (a partir del día de hoy en adelante)
  const todayStr = getTodayIso();
  const tomorrowStr = getOffsetDateIso(1);
  const dayAfterTomorrowStr = getOffsetDateIso(2);

  const [startDate, setStartDate] = useState(
    initialStartDate && initialStartDate >= todayStr ? initialStartDate : todayStr
  );
  const [endDate, setEndDate] = useState(
    initialEndDate && initialEndDate >= todayStr ? initialEndDate : (initialStartDate || todayStr)
  );
  const [bookingTimeSlots, setBookingTimeSlots] = useState<string[]>(initialTimeSlots || []);
  const [intendedUse, setIntendedUse] = useState(initialIntendedUse || '');
  const [acceptContract, setAcceptContract] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  // Horas y mes seleccionados para reserva granular
  const [hourStart, setHourStart] = useState<number>(initialHourStart);
  const [hourEnd, setHourEnd] = useState<number>(initialHourEnd);
  const [selectedMonth, setSelectedMonth] = useState<string>(initialSelectedMonth);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado de Solicitud de Visita
  const [visitDate, setVisitDate] = useState(tomorrowStr);
  const [visitTimeSlot, setVisitTimeSlot] = useState(TIME_SLOTS[0].id);
  const [visitModality, setVisitModality] = useState<'presencial' | 'virtual'>('presencial');
  const [visitAttendees, setVisitAttendees] = useState(2);
  const [visitorName, setVisitorName] = useState(currentUser?.fullName || '');
  const [visitorEmail, setVisitorEmail] = useState(currentUser?.email || '');
  const [visitorPhone, setVisitorPhone] = useState(currentUser?.phone || '+56 9 8765 4321');
  const [visitNotes, setVisitNotes] = useState('');
  const [createdVisit, setCreatedVisit] = useState<VisitRequest | null>(null);

  const [selectedModality, setSelectedModality] = useState<'por_hora' | 'por_dia' | 'mensual'>(
    initialModality || (space?.rentalModality === 'por_hora' ? 'por_hora' : space?.rentalModality === 'mensual' ? 'mensual' : 'por_dia')
  );

  // Sincronizar usuario o modo inicial al abrir el modal
  useEffect(() => {
    if (isOpen) {
      setActiveMode(initialMode);
      setBookingStep(initialStep !== undefined ? initialStep : 1);
      setError(null);
      setCreatedVisit(null);
      const curToday = getTodayIso();
      if (initialStartDate) {
        setStartDate(initialStartDate >= curToday ? initialStartDate : curToday);
      }
      if (initialEndDate) {
        setEndDate(initialEndDate >= curToday ? initialEndDate : getOffsetDateIso(1));
      }
      if (initialTimeSlots) setBookingTimeSlots(initialTimeSlots);
      if (initialIntendedUse) setIntendedUse(initialIntendedUse);
      if (initialHourStart !== undefined) setHourStart(initialHourStart);
      if (initialHourEnd !== undefined) setHourEnd(initialHourEnd);
      if (initialSelectedMonth) setSelectedMonth(initialSelectedMonth);
      if (initialSignature) {
        setSignatureDataUrl(initialSignature);
        setAcceptContract(true);
      }
      if (initialModality) {
        setSelectedModality(initialModality);
      } else if (space) {
        if (space.rentalModality === 'por_hora') setSelectedModality('por_hora');
        else if (space.rentalModality === 'mensual') setSelectedModality('mensual');
        else setSelectedModality('por_dia');
      }
      if (currentUser) {
        setVisitorName(currentUser.fullName);
        setVisitorEmail(currentUser.email);
        setVisitorPhone(currentUser.phone || '+56 9 8765 4321');
      }
    }
  }, [isOpen, initialMode, initialStep, currentUser, initialStartDate, initialEndDate, initialTimeSlots, initialIntendedUse, initialModality, initialHourStart, initialHourEnd, initialSelectedMonth, initialSignature, space]);

  // Cálculo de unidades y montos en CLP según modalidad (misma regla que valida la base).
  const activeModality: 'por_hora' | 'por_dia' | 'mensual' = space
    ? space.rentalModality === 'abierto' || !space.rentalModality
      ? selectedModality
      : space.rentalModality
    : selectedModality;

  const calculations = useMemo(() => {
    if (!space) return { units: 1, label: 'día', subtotal: 0, platformFee: 0, deposit: 0, total: 0, basePrice: 0, discount: 0 };
    const amounts = calculateBookingAmounts({
      space,
      modality: activeModality,
      startDate,
      endDate,
      hourStart: activeModality === 'por_hora' ? hourStart : undefined,
      hourEnd: activeModality === 'por_hora' ? hourEnd : undefined,
      discountClp: discount?.discountClp,
    });
    return {
      units: amounts.units,
      label: amounts.label,
      subtotal: amounts.subtotal,
      platformFee: amounts.platformFee,
      deposit: amounts.deposit,
      discount: amounts.discount,
      total: amounts.total,
      basePrice: amounts.basePrice,
    };
  }, [space, activeModality, startDate, endDate, hourStart, hourEnd, discount]);

  // Si cambian las fechas u horas se descarta el descuento calculado (depende del subtotal).
  useEffect(() => {
    setDiscount(null);
  }, [space?.id, activeModality, startDate, endDate, hourStart, hourEnd]);

  // Registrar la reserva y el contrato firmado, y cobrar con el medio elegido.
  const handlePay = async (choice: PaymentChoice) => {
    if (!currentUser) {
      throw new Error('Debes iniciar sesión con tu cuenta para formalizar la reserva.');
    }
    if (currentUser.verificationStatus !== 'verified') {
      throw new Error('Tu identidad debe estar verificada por un administrador antes de reservar.');
    }
    if (!acceptContract || !signatureDataUrl) {
      setBookingStep(1);
      throw new Error('Debes aceptar y firmar electrónicamente el contrato de arrendamiento.');
    }
    if (startDate < todayStr) {
      throw new Error('La fecha de la reserva debe ser desde el día actual hacia adelante.');
    }
    if (endDate < startDate) {
      throw new Error('La fecha de término no puede ser anterior a la fecha de inicio.');
    }

    setError(null);
    const res = await createBooking({
      space: space!,
      startDate,
      endDate,
      totalDays: calculations.units,
      subtotalClp: calculations.subtotal,
      platformFeeClp: calculations.platformFee,
      securityDepositClp: calculations.deposit,
      totalClp: calculations.total,
      intendedUse: intendedUse.trim(),
      signatureImage: signatureDataUrl,
      signatureType: 'digital_canvas',
      discountCode: discount?.code,
      discountClp: calculations.discount,
      rentalModality: activeModality,
      hourStart: activeModality === 'por_hora' ? hourStart : undefined,
      hourEnd: activeModality === 'por_hora' ? hourEnd : undefined,
      timeSlotString: activeModality === 'por_hora' ? `${String(hourStart).padStart(2, '0')}:00 a ${String(hourEnd).padStart(2, '0')}:00 hrs` : undefined,
      rentalMonth: activeModality === 'mensual' ? selectedMonth : undefined,
      durationUnits: calculations.units,
      priceUnit: activeModality === 'por_hora' ? 'hour' : activeModality === 'mensual' ? 'month' : 'day',
    });

    if (choice.kind === 'card') {
      // El servidor cancela la reserva si el banco rechaza el cobro: en ambos casos
      // se muestra el resultado (exitosa / en lista de espera / rechazada).
      let outcome: 'exito' | 'rechazado' = 'exito';
      try {
        await payWithWalletCard(res.reservation.id, choice.cardId);
      } catch (err) {
        console.warn('Pago con tarjeta guardada no aprobado:', err);
        outcome = 'rechazado';
      }
      onClose();
      navigate(`/my-bookings?pago=${outcome}&reserva=${encodeURIComponent(res.reservation.id)}`);
      return;
    }
    await startWebpayPayment(res.reservation.id);
  };

  // Guarda la reserva en curso y lleva al usuario a Transbank para inscribir una tarjeta.
  const handleAddCard = async () => {
    if (!space) return;
    saveBookingDraft({
      spaceId: space.id,
      modality: activeModality,
      startDate,
      endDate,
      hourStart,
      hourEnd,
      selectedMonth,
      intendedUse,
      signature: acceptContract ? signatureDataUrl : null,
    });
    await addWalletCard(`/space/${encodeURIComponent(space.id)}?retomar=1`);
  };

  // Enviar Solicitud de Visita
  const handleSubmitVisit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!space) return;

    if (!currentUser) {
      setError('Debes iniciar sesión o registrarte para agendar una visita con el anfitrión.');
      if (onOpenAuth) {
        onClose();
        onOpenAuth('login', 'Inicia sesión o regístrate para coordinar una visita al espacio.');
      }
      return;
    }

    if (!visitorName.trim()) {
      setError('Por favor ingresa tu nombre completo para la visita.');
      return;
    }
    if (!visitorPhone.trim()) {
      setError('Por favor ingresa un teléfono o WhatsApp de contacto.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const visit = requestVisit({
        spaceId: space.id,
        spaceTitle: space.title,
        spaceAddress: space.address ? `${space.address}, ${space.commune}` : space.commune,
        spaceImage: space.images?.[0] || '',
        tenantId: currentUser.id,
        tenantName: visitorName.trim(),
        tenantEmail: visitorEmail.trim() || currentUser.email,
        tenantPhone: visitorPhone.trim(),
        ownerId: space.ownerId,
        ownerName: space.ownerName,
        ownerRut: space.ownerRut,
        visitDate,
        visitTimeSlot,
        modality: visitModality,
        attendeesCount: visitAttendees,
        notes: visitNotes.trim() || undefined,
      });

      setCreatedVisit(visit);
    } catch (err: any) {
      setError(err.message || 'Error al solicitar visita.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !space) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
      <div
        id="booking-visit-modal"
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col"
      >
        {/* Cabecera Principal del Modal */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-brand-400 uppercase tracking-wider">
                  {getCategoryLabel(space.category)}
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-xs text-slate-300 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {space.commune}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-semibold text-white truncate max-w-md sm:max-w-lg">
                {space.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pestañas Superiores: [ Reservar Espacio ] vs [ Solicitar Visita Gratuita ] */}
        <div className="bg-slate-100 p-2 border-b border-slate-200 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveMode('booking');
              setError(null);
            }}
            className={`flex-1 py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
              activeMode === 'booking'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            <span>Reservar espacio (Contrato y pago)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveMode('visit');
              setError(null);
            }}
            className={`flex-1 py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
              activeMode === 'visit'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Solicitar visita (Gratuita)</span>
          </button>
        </div>

        {/* Mensaje de Error General */}
        {error && (
          <div className="m-4 p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {/* CONTENIDO SCROLLABLE */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* ============================================================ */}
          {/* MODO 1: FLUJO DE RESERVA DIRECTA (CONTRATO Y PAGO)           */}
          {/* ============================================================ */}
          {activeMode === 'booking' && (
            <div className="space-y-5">
              {/* BLOQUEO POR VERIFICACIÓN */}
              {(!currentUser || currentUser.verificationStatus !== 'verified') ? (
                <div className={`border rounded-3xl p-6 sm:p-8 space-y-6 text-center animate-in fade-in zoom-in duration-300 ${
                  currentUser?.verificationStatus === 'rejected'
                    ? 'bg-brand-50 border-brand-200'
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-sm ring-4 ring-white ${
                    currentUser?.verificationStatus === 'rejected'
                      ? 'bg-brand-100 text-brand-600'
                      : 'bg-amber-100 text-amber-600'
                  }`}>
                    <ShieldCheck className="w-10 h-10" />
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className={`text-xl font-semibold ${
                      currentUser?.verificationStatus === 'rejected' ? 'text-red-950' : 'text-amber-950'
                    }`}>
                      {currentUser?.verificationStatus === 'rejected'
                        ? 'Tu solicitud de verificación fue rechazada'
                        : 'Se requiere verificación para reservar'}
                    </h3>
                    <p className={`text-sm leading-relaxed max-w-sm mx-auto ${
                      currentUser?.verificationStatus === 'rejected' ? 'text-brand-800' : 'text-amber-800'
                    }`}>
                      {currentUser?.verificationStatus === 'rejected' ? (
                        <>
                          <strong>Motivo del rechazo:</strong> "
                          {currentUser.kycRejectionReason ||
                            currentUser.kycData?.rejectionReason ||
                            'La documentación enviada presenta observaciones o no es legible.'}
                          "
                        </>
                      ) : (
                        <>
                          Por normativa de seguridad, solo usuarios con <strong>Perfil verificado</strong> pueden emitir contratos bajo la <strong>Ley 18.101</strong> y realizar pagos en Spotly.
                        </>
                      )}
                    </p>
                  </div>

                  <div className="bg-white/60 backdrop-blur-md rounded-2xl p-4 border border-amber-200 text-left space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-semibold text-slate-800">Cumplimiento de normativa legal (RUT validado)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-semibold text-slate-800">Protección contra fraudes y suplantación</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-semibold text-slate-800">Fianza resguardada en cuenta de custodia Spotly</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        navigate('/onboarding');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`w-full py-4 text-white rounded-2xl font-semibold text-sm transition shadow-lg flex items-center justify-center gap-2 cursor-pointer ${
                        currentUser?.verificationStatus === 'rejected'
                          ? 'bg-brand-600 hover:bg-brand-700 shadow-brand-600/20'
                          : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                      }`}
                    >
                      <FileCheck2 className="w-5 h-5" />
                      <span>
                        {currentUser?.verificationStatus === 'rejected'
                          ? 'Ver estado de solicitud y corregir documentos'
                          : 'Verificar mi identidad ahora'}
                      </span>
                    </button>
                    <button
                      onClick={() => setActiveMode('visit')}
                      className="w-full py-3 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition border border-slate-200"
                    >
                      Agendar Visita (No requiere verificación)
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Indicador Visual de Pasos (Directo y Transparente) */}
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition ${
                      bookingStep === 1
                        ? 'bg-brand-600 text-white shadow-xs'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {bookingStep > 1 ? <Check className="w-3.5 h-3.5" /> : '1'}
                  </div>
                  <span className={`text-xs font-semibold ${bookingStep === 1 ? 'text-slate-900' : 'text-slate-500'}`}>
                    1. Contrato Digital (Ley 18.101)
                  </span>
                </div>

                <div className="h-0.5 w-12 bg-slate-200 hidden sm:block" />

                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition ${
                      bookingStep === 2
                        ? 'bg-brand-600 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    2
                  </div>
                  <span className={`text-xs font-semibold ${bookingStep === 2 ? 'text-slate-900' : 'text-slate-400'}`}>
                    2. Pago Seguro Webpay Plus
                  </span>
                </div>
              </div>

              {/* PASO 1: CONTRATO DIGITAL LEY 18.101 */}
              {bookingStep === 1 && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Banner de inicio de sesión requerido si el usuario no está autenticado */}
                  {!currentUser && (
                    <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50/60 border border-amber-200 rounded-2xl space-y-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                          <Lock className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-amber-950">Inicia sesión o regístrate para formalizar</h4>
                          <p className="text-[12.5px] text-amber-850">
                            Para individualizar legalmente al arrendatario con su RUT y procesar el pago de forma segura, debes contar con una cuenta activa.
                          </p>
                        </div>
                      </div>
                      {onOpenAuth && (
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenAuth('login', 'Inicia sesión para formalizar el contrato de arriendo.');
                            }}
                            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                          >
                            Iniciar sesión
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenAuth('register', 'Regístrate gratis para suscribir contratos de arriendo.');
                            }}
                            className="px-3.5 py-1.5 bg-white hover:bg-amber-100 border border-amber-300 text-amber-950 rounded-xl text-xs font-semibold transition cursor-pointer"
                          >
                            Crear cuenta
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                      <div>
                        <span className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 uppercase tracking-wide">
                          <FileCheck2 className="w-4 h-4 text-brand-600" />
                          Contrato de arrendamiento
                        </span>
                        <span className="text-[11.5px] text-slate-500 font-semibold mt-1 block">
                          Generado automáticamente por Spotly
                        </span>
                      </div>
                      <span className="text-[11.5px] bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-semibold uppercase tracking-wider">
                        Ley N° 18.101
                      </span>
                    </div>

                    <div className="text-xs sm:text-[13px] text-slate-800 space-y-3.5 leading-relaxed">
                      <p>
                        En Santiago de Chile, a {new Date().toLocaleDateString('es-CL')}, se celebra el presente contrato de arrendamiento entre las siguientes partes:
                      </p>
                      
                      <div className="space-y-2 py-1">
                        <p>
                          <strong>Arrendador (Propietario):</strong> {space.ownerName} (RUT: {space.ownerRut ? formatRut(space.ownerRut) : 'se consigna en el contrato al confirmar'})
                        </p>
                        <p>
                          <strong>Arrendatario:</strong> {currentUser?.fullName || 'Usuario no registrado (Inicio de sesión requerido)'} (RUT: {currentUser?.rut || 'Pendiente de autenticación'})
                        </p>
                        <p>
                          <strong>Inmueble:</strong> {space.title}, ubicado en {space.address ? `${space.address}, ` : ''}{space.commune}{space.address ? '' : ' (la dirección exacta se consigna en el contrato al confirmar)'}.
                        </p>
                      </div>

                      <p>
                        <strong>Primero:</strong> El Arrendador da en arriendo el Inmueble detallado precedentemente al Arrendatario, quien lo acepta para el uso exclusivo de: <strong>{intendedUse.trim() || 'Actividades comerciales o profesionales lícitas declaradas por el arrendatario'}</strong>.
                      </p>
                      
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <p>
                          <strong>Segundo (Vigencia y horario):</strong>{' '}
                          {selectedModality === 'por_hora' ? (
                            <span>
                              La vigencia y ocupación será el día <strong>{startDate || todayStr}</strong>, en el horario exacto de <strong>{String(hourStart).padStart(2, '0')}:00 a {String(hourEnd).padStart(2, '0')}:00 hrs</strong> ({calculations.units} {calculations.label} cronológicas continuas). Dicha franja horaria queda bloqueada y sincronizada exclusivamente para el arrendatario en el sistema Spotly.
                            </span>
                          ) : selectedModality === 'mensual' ? (
                            <span>
                              La vigencia del arriendo mensual corresponde al mes <strong>{selectedMonth || 'Octubre 2026'}</strong> ({calculations.units} {calculations.label}), con ocupación exclusiva bajo el marco de la Ley N° 18.101. El espacio queda bloqueado en el calendario durante todo el período.
                            </span>
                          ) : (
                            <span>
                              La vigencia de este contrato será desde el día <strong>{startDate || todayStr}</strong> hasta el día <strong>{endDate || tomorrowStr}</strong>, comprendiendo un total de <strong>{calculations.units} {calculations.label} completos</strong>.
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-700 pt-1">
                          <Lock className="w-3.5 h-3.5 shrink-0" />
                          <span>Bloqueo Activo: Se reserva y bloquea este horario/fecha para evitar doble reserva con otros clientes.</span>
                        </div>
                      </div>
                      
                      <p>
                        <strong>Tercero:</strong> El valor acordado para este período es de <strong>{formatClp(calculations.subtotal)}</strong>{calculations.deposit > 0 ? (<>, más una garantía retornable de <strong>{formatClp(calculations.deposit)}</strong></>) : null}, totalizando a pagar <strong>{formatClp(calculations.total)}</strong> (incluye la comisión de servicio de 5 %).
                      </p>
                    </div>
                  </div>

                  {/* Campo obligatorio: ¿Para qué va a utilizar este lugar? */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <label className="text-xs font-semibold text-slate-900 block">
                      ¿Para qué va a utilizar este lugar?
                    </label>
                    <textarea
                      rows={2}
                      value={intendedUse}
                      onChange={(e) => setIntendedUse(e.target.value)}
                      placeholder="Comenta aquí para qué vas a utilizar este lugar..."
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-hidden bg-white"
                    />
                  </div>

                  {/* Checkbox de aceptación legal */}
                  <label className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-100 transition">
                    <input
                      type="checkbox"
                      checked={acceptContract}
                      onChange={(e) => setAcceptContract(e.target.checked)}
                      className="w-4 h-4 mt-0.5 text-brand-600 rounded-md border-slate-300 focus:ring-brand-500 cursor-pointer"
                    />
                    <span className="text-xs text-slate-700 leading-relaxed font-semibold">
                      Leí el contrato y acepto los términos y condiciones
                    </span>
                  </label>

                  {/* Firma Digital Integrada */}
                  <div className="pt-2">
                    <SignatureCanvas onSignatureChange={setSignatureDataUrl} />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Volver al detalle</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!currentUser) {
                          setError('Debes iniciar sesión o registrarte con tu RUT para emitir el contrato y proceder al pago.');
                          if (onOpenAuth) {
                            onClose();
                            onOpenAuth('login', 'Debes iniciar sesión o registrarte para realizar tu reserva.');
                          }
                          return;
                        }
                        if (!intendedUse.trim()) {
                          setError('Por favor comenta para qué vas a utilizar este lugar antes de continuar.');
                          return;
                        }
                        if (!acceptContract) {
                          setError('Debes marcar la casilla para suscribir y firmar el contrato digital.');
                          return;
                        }
                        if (!signatureDataUrl) {
                          setError('Por favor dibuja tu firma en el recuadro para avanzar.');
                          return;
                        }
                        setError(null);
                        setBookingStep(2);
                      }}
                      className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold text-xs transition flex items-center gap-2 cursor-pointer shadow-md"
                    >
                      <span>Continuar al pago seguro</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* PASO 2: PAGO SEGURO WEBPAY / TARJETAS */}
              {bookingStep === 2 && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Banner de Estado de Verificación del Usuario */}
                  {!currentUser ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
                      <div className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                        <Lock className="w-4 h-4 text-amber-600" />
                        <span>Inicia sesión para confirmar tu reserva</span>
                      </div>
                      <p className="text-xs text-amber-700">
                        Necesitas una cuenta activa para asociar el contrato legal y los comprobantes de pago.
                      </p>
                      {onOpenAuth && (
                        <button
                          type="button"
                          onClick={() => onOpenAuth('login', 'Inicia sesión para formalizar tu reserva')}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
                        >
                          Iniciar sesión ahora
                        </button>
                      )}
                    </div>
                  ) : currentUser.verificationStatus !== 'verified' ? (
                    <div className="p-4 bg-brand-50 border border-brand-200 rounded-2xl space-y-2">
                      <div className="text-xs font-semibold text-brand-900 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-brand-600" />
                          <span>Validación de identidad requerida</span>
                        </span>
                        <span className="text-[11.5px] bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full font-semibold">
                          KYC Chile
                        </span>
                      </div>
                      <p className="text-xs text-brand-700 leading-relaxed">
                        Para arriendos regidos por la Ley 18.101 tu identidad debe estar validada por un administrador (cédula, selfie y certificado de antecedentes).
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          navigate('/onboarding');
                        }}
                        className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                      >
                        Verificar mi identidad
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>Identidad verificada exitosamente ({currentUser.fullName} - RUT {formatRut(currentUser.rut)})</span>
                    </div>
                  )}

                  {/* Componente Modular de Pago Webpay */}
                  <CheckoutPaymentBox
                    units={calculations.units}
                    unitLabel={calculations.label}
                    basePrice={calculations.basePrice}
                    subtotalClp={calculations.subtotal}
                    platformFeeClp={calculations.platformFee}
                    depositClp={calculations.deposit}
                    discount={discount}
                    onDiscountChange={setDiscount}
                    onPay={handlePay}
                    onAddCard={handleAddCard}
                    onCancel={() => setBookingStep(1)}
                    notice={paymentNotice}
                    disabled={!currentUser || currentUser.verificationStatus !== 'verified'}
                  />
                </div>
              )}
                </>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* MODO 2: FLUJO DE SOLICITAR VISITA (INTUITIVO Y COMPLETO)     */}
          {/* ============================================================ */}
          {activeMode === 'visit' && (
            <div className="space-y-5 animate-in fade-in">
              {/* SI YA SE GENERÓ LA VISITA CON ÉXITO */}
              {createdVisit ? (
                <div className="p-6 bg-emerald-950/80 rounded-3xl border border-emerald-600 text-white space-y-4 text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center mx-auto shadow-lg animate-bounce">
                    <CalendarCheck className="w-8 h-8" />
                  </div>

                  <div>
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold mb-2">
                      Solicitud registrada y confirmada
                    </span>
                    <h3 className="text-lg font-semibold text-white">¡Visita agendada con éxito!</h3>
                    <p className="text-xs text-slate-300 max-w-md mx-auto mt-1">
                      El anfitrión <strong>{createdVisit.ownerName}</strong> ha sido notificado para recibirte en el recinto.
                    </p>
                  </div>

                  {/* Voucher Card */}
                  <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-4 text-left text-xs space-y-2.5 max-w-md mx-auto">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-slate-400">Código de visita:</span>
                      <span className="font-mono font-semibold text-emerald-400">{createdVisit.id}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Fecha pactada:</span>
                      <span className="font-semibold text-white">{createdVisit.visitDate}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Franja horaria:</span>
                      <span className="font-semibold text-cyan-400">{createdVisit.visitTimeSlot}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Modalidad:</span>
                      <span className="font-semibold capitalize text-white">
                        {createdVisit.modality === 'presencial' ? 'Presencial en el recinto' : 'Virtual (Videollamada)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Dirección:</span>
                      <span className="font-semibold text-white text-right truncate max-w-[200px]">
                        {createdVisit.spaceAddress}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setCreatedVisit(null)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                    >
                      Agendar otra fecha
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-xl text-xs font-semibold transition cursor-pointer shadow-md"
                    >
                      Entendido, cerrar
                    </button>
                  </div>
                </div>
              ) : (
                /* FORMULARIO DE AGENDAMIENTO DE VISITA */
                <form onSubmit={handleSubmitVisit} className="space-y-4">
                  {/* Banner de Valor Gratuito */}
                  <div className="p-4 bg-brand-50 border border-brand-200 rounded-2xl flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center flex-shrink-0">
                      <Info className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-brand-950">
                        Visita 100% gratuita y sin compromiso
                      </h4>
                      <p className="text-xs text-brand-700 mt-0.5 leading-relaxed">
                        Conoce el espacio, verifica su acústica, iluminación o capacidad antes de arrendar. Puedes coordinar una visita presencial o una videollamada guiada en vivo.
                      </p>
                    </div>
                  </div>

                  {/* 1. Modalidad: Presencial vs Virtual */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-800">1. Selecciona la Modalidad de Visita:</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setVisitModality('presencial')}
                        className={`p-3.5 rounded-2xl border-2 text-left transition cursor-pointer flex items-center gap-3 ${
                          visitModality === 'presencial'
                            ? 'border-brand-600 bg-brand-50/50 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          visitModality === 'presencial' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-900">Visita presencial</div>
                          <div className="text-[12.5px] text-slate-500">En {space.commune}</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setVisitModality('virtual')}
                        className={`p-3.5 rounded-2xl border-2 text-left transition cursor-pointer flex items-center gap-3 ${
                          visitModality === 'virtual'
                            ? 'border-brand-600 bg-brand-50/50 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          visitModality === 'virtual' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          <Video className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-900">Visita virtual</div>
                          <div className="text-[12.5px] text-slate-500">Videollamada en vivo</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* 2. Fecha y Horario */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                        <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span>Fecha deseada de visita</span>
                      </label>
                      <input
                        type="date"
                        min={tomorrowStr}
                        value={visitDate}
                        onChange={(e) => setVisitDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-brand-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>Cantidad de asistentes</span>
                      </label>
                      <select
                        value={visitAttendees}
                        onChange={(e) => setVisitAttendees(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-brand-500 focus:outline-hidden"
                      >
                        <option value={1}>1 persona (solo tú)</option>
                        <option value={2}>2 personas</option>
                        <option value={3}>3 personas</option>
                        <option value={4}>4 personas</option>
                        <option value={5}>5 o más personas</option>
                      </select>
                    </div>
                  </div>

                  {/* Franja Horaria */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-800">Franja horaria de preferencia:</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {TIME_SLOTS.map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => setVisitTimeSlot(slot.id)}
                          className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                            visitTimeSlot === slot.id
                              ? 'bg-brand-600 border-brand-600 text-white font-semibold shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className="text-[11.5px] opacity-80 uppercase tracking-wider">{slot.period}</div>
                          <div className="text-xs font-semibold mt-0.5">{slot.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Datos de Contacto */}
                  <div className="space-y-2 pt-1">
                    <label className="text-xs font-semibold text-slate-800">Datos para la Coordinación:</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        placeholder="Nombre completo"
                        value={visitorName}
                        onChange={(e) => setVisitorName(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-brand-500 focus:outline-hidden"
                      />
                      <input
                        type="tel"
                        placeholder="Teléfono / WhatsApp (+56 9...)"
                        value={visitorPhone}
                        onChange={(e) => setVisitorPhone(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-brand-500 focus:outline-hidden"
                      />
                    </div>
                    <input
                      type="email"
                      placeholder="Correo electrónico para recordatorio"
                      value={visitorEmail}
                      onChange={(e) => setVisitorEmail(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-brand-500 focus:outline-hidden"
                    />
                    <textarea
                      rows={2}
                      placeholder="Pregunta o solicitud especial para el anfitrión (opcional)"
                      value={visitNotes}
                      onChange={(e) => setVisitNotes(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold text-xs transition flex items-center gap-2 cursor-pointer shadow-md"
                    >
                      {loading ? (
                        <>
                          <RotateCcw className="w-4 h-4 animate-spin" />
                          <span>Agendando visita...</span>
                        </>
                      ) : (
                        <>
                          <CalendarCheck className="w-4 h-4" />
                          <span>Confirmar solicitud de visita gratuita</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
