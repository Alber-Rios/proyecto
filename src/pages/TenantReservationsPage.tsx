import { TabPanel } from '../components/motion/Motion.tsx';
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BookingResultModal, PaymentOutcome } from '../components/BookingResultModal.tsx';
import { ReservationActions, PaymentStatusBadge, reservationStatusLabel } from '../components/ReservationActions.tsx';
import { getReviewsByTenant } from '../lib/dataAccess.ts';
import { useApp } from '../context/AppContext.tsx';
import { formatClp, formatRut } from '../utils/formatters.ts';
import { ContractModal } from '../components/ContractModal.tsx';
import { DigitalContract, Reservation, Review } from '../types.ts';
import {
  downloadContractDocument,
  downloadReservationDocument,
} from '../utils/documentDownloader.ts';
import {
  FileText,
  CheckCircle2,
  Building,
  Calendar,
  Info,
  ShieldCheck,
  Scale,
  MapPin,
  Video,
  Users,
  Download,
  Eye,
  X,
  CreditCard,
  Clock,
} from 'lucide-react';

interface TenantReservationsPageProps {
  onNavigate: (view: string) => void;
  onOpenOwnerUpgrade: () => void;
  onOpenAuth?: (mode: 'login' | 'register', notice?: string) => void;
}

export const TenantReservationsPage: React.FC<TenantReservationsPageProps> = ({
  onNavigate,
  onOpenOwnerUpgrade,
  onOpenAuth,
}) => {
  const { currentUser, reservations, contracts, visitRequests, createDispute, refreshReservations } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const routerNavigate = useNavigate();
  const paymentResult = searchParams.get('pago');
  const [myReviews, setMyReviews] = useState<Review[]>([]);

  const highlightId = searchParams.get('reserva');
  const [confirmingPayment, setConfirmingPayment] = useState(Boolean(paymentResult));

  // Al volver de Webpay se recargan reservas y pagos con el estado definitivo
  // antes de mostrar el resultado (exitosa, en lista de espera o rechazada).
  useEffect(() => {
    if (!paymentResult) return;
    setConfirmingPayment(true);
    refreshReservations()
      .catch(console.warn)
      .finally(() => setConfirmingPayment(false));
  }, [paymentResult]);

  useEffect(() => {
    if (currentUser) {
      getReviewsByTenant(currentUser.id).then(setMyReviews).catch(console.warn);
    }
  }, [currentUser?.id]);

  const [activeTab, setActiveTab] = useState<'confirmed' | 'waitlist' | 'visits'>('confirmed');
  const [showClosed, setShowClosed] = useState(false);
  const [selectedContract, setSelectedContract] = useState<DigitalContract | null>(null);
  const [selectedBookingDetail, setSelectedBookingDetail] = useState<Reservation | null>(null);
  const [disputeReservationId, setDisputeReservationId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');

  // (Los hooks van antes de los retornos tempranos para respetar las reglas de React.)
  // Filtrar las reservas de este usuario
  const myBookings = useMemo(() => {
    return reservations.filter((r) => r.tenantId === currentUser?.id);
  }, [reservations, currentUser?.id]);

  // Mis reservas: confirmadas (próximas primero) y finalizadas.
  const confirmedBookings = useMemo(
    () =>
      myBookings
        .filter((b) => b.status === 'confirmed' || b.status === 'completed')
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'confirmed' ? -1 : 1;
          return a.status === 'confirmed' ? a.startDate.localeCompare(b.startDate) : b.startDate.localeCompare(a.startDate);
        }),
    [myBookings]
  );
  // Lista de espera: pagadas que esperan la aceptación del anfitrión, y las que
  // aún están dentro del plazo para pagar.
  const waitlistBookings = useMemo(
    () => myBookings.filter((b) => b.status === 'pending').sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [myBookings]
  );
  const closedBookings = useMemo(
    () => myBookings.filter((b) => b.status === 'cancelled' || b.status === 'rejected'),
    [myBookings]
  );
  const resultReservation = highlightId ? myBookings.find((b) => b.id === highlightId) : undefined;

  // Al llegar desde un pago se abre la pestaña donde quedó la reserva.
  useEffect(() => {
    if (!resultReservation) return;
    if (resultReservation.status === 'pending') setActiveTab('waitlist');
    else if (resultReservation.status === 'cancelled' || resultReservation.status === 'rejected') setShowClosed(true);
    else setActiveTab('confirmed');
  }, [resultReservation?.id, resultReservation?.status]);

  const closePaymentResult = (keepHighlight: boolean) => {
    const next = new URLSearchParams();
    if (keepHighlight && highlightId) next.set('reserva', highlightId);
    setSearchParams(next, { replace: true });
    if (keepHighlight && highlightId) {
      window.setTimeout(() => {
        document.getElementById(`reserva-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  };

  // Filtrar solicitudes de visita de este usuario
  const myVisits = useMemo(() => {
    return visitRequests.filter(
      (v) =>
        Boolean(currentUser) &&
        (v.tenantId === currentUser!.id || v.tenantEmail.toLowerCase() === currentUser!.email.toLowerCase())
    );
  }, [visitRequests, currentUser]);

  // Si no está registrado o autenticado
  if (!currentUser) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-lg space-y-6">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto shadow-xs">
            <FileText className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
              Acceso a mis arriendos
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Inicia sesión para ver tus reservas
            </h2>
            <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              Tus solicitudes de arriendo, contratos digitales suscritos bajo la Ley 18.101 y comprobantes de reserva están asociados a tu cuenta.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => onOpenAuth?.('login', 'Inicia sesión para acceder a tu historial de arriendos.')}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => onOpenAuth?.('register', 'Crea tu cuenta de Arrendatario para reservar espacios en Chile.')}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              Registrarte gratis
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Si es administrador, redirigir o avisar que esta vista es exclusiva de usuarios
  if (currentUser.role === 'admin') {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center shadow-sm space-y-5">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-slate-900">Sesión de administrador activa</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              La cuenta de Administrador no realiza reservas personales. Dirígete al Panel de Administración para auditar usuarios, moderar espacios y revisar disputas.
            </p>
          </div>
          <button
            onClick={() => onNavigate('admin')}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer"
          >
            Ir al panel administrador
          </button>
        </div>
      </div>
    );
  }

  const findContract = (reservation: Reservation): DigitalContract | undefined =>
    contracts.find((c) => c.id === reservation.digitalContractId || c.reservationId === reservation.id);

  const handleOpenContract = (reservation: Reservation) => {
    const contract = findContract(reservation);
    if (!contract) {
      alert('Esta reserva no tiene un contrato firmado registrado. Los contratos se generan y firman al momento de reservar.');
      return;
    }
    setSelectedContract(contract);
  };

  const handleDownloadContract = (reservation: Reservation) => {
    const contract = findContract(reservation);
    if (!contract) {
      alert('Esta reserva no tiene un contrato firmado registrado. Los contratos se generan y firman al momento de reservar.');
      return;
    }
    downloadContractDocument(contract);
  };

  const handleSendDispute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeReservationId || !disputeReason.trim()) return;

    createDispute(disputeReservationId, disputeReason);
    setDisputeReservationId(null);
    setDisputeReason('');
  };

  const summaryCards = [
    {
      label: 'Reservas confirmadas',
      value: myBookings.filter((booking) => booking.status === 'confirmed').length,
      tone: 'emerald',
    },
    {
      label: 'En lista de espera',
      value: waitlistBookings.length,
      tone: 'amber',
    },
    {
      label: 'Visitas agendadas',
      value: myVisits.length,
      tone: 'indigo',
    },
  ];

  const renderBooking = (booking: Reservation) => (
  <div
    key={booking.id}
    id={`reserva-${booking.id}`}
    className={`bg-white rounded-3xl border p-5 sm:p-6 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-5 hover:shadow-md transition ${
      booking.id === highlightId ? 'border-rose-400 ring-2 ring-rose-200' : 'border-slate-200'
    }`}
  >
    <div className="flex flex-col sm:flex-row items-start gap-4 min-w-0 flex-1">
      <img
        src={booking.spaceImage}
        alt={booking.spaceTitle}
        className="w-full sm:w-40 h-32 object-cover rounded-2xl bg-slate-100 shrink-0"
      />

      <div className="space-y-2 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-lg">
            Reserva #{booking.id.slice(-6)}
          </span>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
              booking.status === 'confirmed'
                ? 'bg-emerald-100 text-emerald-800'
                : booking.status === 'pending'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-rose-100 text-rose-800'
            }`}
          >
            {reservationStatusLabel(booking)}
          </span>
          <PaymentStatusBadge reservation={booking} />
          {booking.disputeStatus === 'opened' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
              Disputa en arbitraje
            </span>
          )}
        </div>

        <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
          {booking.spaceTitle}
        </h3>
        <div className="text-xs text-slate-500 flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span className="truncate">{booking.spaceAddress}</span>
        </div>

        <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
          <span className="flex items-center gap-1 font-medium text-slate-800">
            <Calendar className="w-3.5 h-3.5 text-rose-500" />
            {booking.startDate} al {booking.endDate} (
            {booking.rentalModality === 'por_hora'
              ? `${booking.durationUnits || 1} hrs`
              : `${booking.totalDays} ${booking.totalDays === 1 ? 'día' : 'días'}`}
            )
          </span>
          <span>
            Anfitrión: <strong className="text-slate-800">{booking.ownerName}</strong>
          </span>
          <span>
            Total Pagado:{' '}
            <strong className="text-slate-900 font-extrabold">{formatClp(booking.totalClp)}</strong>
          </span>
          {booking.securityDepositClp > 0 && (
            <span className="text-slate-500">
              Garantía: <strong>{formatClp(booking.securityDepositClp)}</strong>
            </span>
          )}
          {booking.discountClp ? (
            <span className="text-emerald-700">
              Descuento {booking.discountCode}: <strong>−{formatClp(booking.discountClp)}</strong>
            </span>
          ) : null}
          {booking.refundAmountClp !== undefined && booking.refundAmountClp > 0 && (
            <span className="text-indigo-700">
              Reembolso: <strong>{formatClp(booking.refundAmountClp)}</strong>
            </span>
          )}
        </div>
      </div>
    </div>

    {/* Botones de Acción: Ver Detalle, Descargar Reserva, Ver/Descargar Contrato */}
    <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 pt-3 xl:pt-0 border-t xl:border-t-0 border-slate-100 shrink-0 w-full xl:w-auto">
      <button
        onClick={() => setSelectedBookingDetail(booking)}
        className="w-full sm:w-auto px-3.5 py-2.5 sm:py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
      >
        <Eye className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        Ver reserva
      </button>

      <button
        onClick={() => downloadReservationDocument(booking)}
        className="w-full sm:w-auto px-3.5 py-2.5 sm:py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
        title="Descargar comprobante oficial de la reserva"
      >
        <Download className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
        Descargar reserva
      </button>

      <button
        onClick={() => handleOpenContract(booking)}
        className="w-full sm:w-auto px-3.5 py-2.5 sm:py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
      >
        <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
        Ver contrato
      </button>

      <button
        onClick={() => handleDownloadContract(booking)}
        className="w-full sm:w-auto px-3.5 py-2.5 sm:py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
        title="Descargar contrato de arrendamiento digital"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        Descargar contrato
      </button>

      <ReservationActions
        reservation={booking}
        existingReview={myReviews.find((r) => r.reservationId === booking.id)}
        onReviewed={(review) => setMyReviews((prev) => [review, ...prev])}
      />

      {booking.disputeStatus !== 'opened' && (
        <button
          onClick={() => setDisputeReservationId(booking.id)}
          className="w-full sm:w-auto px-3 py-2.5 sm:py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
        >
          <Scale className="w-3.5 h-3.5 shrink-0" />
          Reportar problema del lugar
        </button>
      )}
    </div>
  </div>
  );

  return (
    <div className="space-y-6 pb-16">
      {/* Cabecera */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
              Mis reservas y contratos
            </span>
            <span className="text-xs text-slate-400 font-mono">RUT: {formatRut(currentUser.rut)}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Mis arriendos y comprobantes
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Revisa el detalle de tus reservas, descarga tu comprobante de reserva o descarga el contrato digital Ley 18.101.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
          <button
            onClick={() => onNavigate('support')}
            className="w-full sm:w-auto px-4 py-2.5 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Scale className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Ayuda y soporte (Reportar problema)</span>
          </button>
          <button
            onClick={() => onNavigate('home')}
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Building className="w-4 h-4 shrink-0" />
            <span>Explorar más espacios</span>
          </button>
        </div>
      </div>

      {/* KPIs de Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
          >
            <div
              className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                card.tone === 'emerald'
                  ? 'bg-emerald-100 text-emerald-800'
                  : card.tone === 'amber'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-indigo-100 text-indigo-800'
              }`}
            >
              {card.label}
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900 tabular-nums">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Banner de conversión si aún no es propietario */}
      {!currentUser.ownerTermsAccepted && currentUser.role === 'tenant' && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-200 flex items-center justify-center text-amber-800 shrink-0">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-950">¿Tienes una oficina, estudio o local para arrendar?</h4>
              <p className="text-xs text-amber-800">
                Activa tu perfil de propietario para publicar tus espacios y recibir reservas en Spotly.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenOwnerUpgrade}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition whitespace-nowrap cursor-pointer"
          >
            Quiero ser propietario
          </button>
        </div>
      )}

      {paymentResult && (
        <BookingResultModal
          outcome={(['exito', 'rechazado', 'anulado', 'expirado'].includes(paymentResult) ? paymentResult : 'error') as PaymentOutcome}
          reservation={resultReservation}
          loading={confirmingPayment}
          onFinish={() => {
            closePaymentResult(false);
            onNavigate('home');
          }}
          onViewBookings={() => closePaymentResult(true)}
          onRetry={
            resultReservation
              ? () => {
                  closePaymentResult(false);
                  routerNavigate(`/space/${encodeURIComponent(resultReservation.spaceId)}`);
                }
              : undefined
          }
        />
      )}

      {/* Pestañas: Reservas vs Visitas */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('confirmed')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'confirmed'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span>Mis reservas ({confirmedBookings.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('waitlist')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'waitlist'
              ? 'bg-amber-500 text-slate-900 shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span>Lista de espera ({waitlistBookings.length})</span>
          {waitlistBookings.length > 0 && activeTab !== 'waitlist' && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" aria-hidden />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('visits')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'visits'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <MapPin className="w-4 h-4 shrink-0" />
          <span>Mis Visitas Agendadas ({myVisits.length})</span>
        </button>
      </div>

      <TabPanel tabKey={activeTab}>
      {activeTab === 'confirmed' ? (
        <div className="space-y-4">
          {confirmedBookings.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
              <FileText className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">Aún no tienes reservas confirmadas</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {waitlistBookings.length > 0
                  ? `Tienes ${waitlistBookings.length} ${waitlistBookings.length === 1 ? 'solicitud' : 'solicitudes'} en lista de espera: aparecerán aquí cuando el anfitrión las acepte.`
                  : 'Explora el catálogo de oficinas, estudios y salas para reservar tu próximo espacio con contrato digital.'}
              </p>
              <button
                onClick={() => (waitlistBookings.length > 0 ? setActiveTab('waitlist') : onNavigate('home'))}
                className="mt-2 px-5 py-2.5 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700 transition inline-flex items-center gap-2 cursor-pointer"
              >
                {waitlistBookings.length > 0 ? 'Ver lista de espera' : 'Ver espacios disponibles'}
              </button>
            </div>
          ) : (
            confirmedBookings.map(renderBooking)
          )}

          {closedBookings.length > 0 && (
            <div className="pt-2 space-y-4">
              <button
                type="button"
                onClick={() => setShowClosed((v) => !v)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                aria-expanded={showClosed}
              >
                {showClosed ? 'Ocultar' : 'Ver'} reservas canceladas o rechazadas ({closedBookings.length})
              </button>
              {showClosed && <div className="space-y-4 opacity-80">{closedBookings.map(renderBooking)}</div>}
            </div>
          )}
        </div>
      ) : activeTab === 'waitlist' ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <Clock className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Aquí quedan tus solicitudes mientras el anfitrión decide. Cuando las acepte pasarán solas a <strong>Mis reservas</strong>.
              Si las rechaza, o no responde antes de la fecha de inicio, se cancelan y se te devuelve el 100 % de lo pagado.
            </p>
          </div>
          {waitlistBookings.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center text-xs text-slate-500">
              No tienes solicitudes en lista de espera.
            </div>
          ) : (
            waitlistBookings.map(renderBooking)
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {myVisits.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
              <MapPin className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">No tienes visitas agendadas</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Puedes agendar una visita presencial o virtual gratuita desde la ficha de cualquier espacio.
              </p>
              <button
                onClick={() => onNavigate('home')}
                className="mt-2 px-5 py-2.5 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 transition inline-flex items-center gap-2 cursor-pointer"
              >
                Explorar catálogo
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {myVisits.map((visit) => (
                <div
                  key={visit.id}
                  className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-md transition"
                >
                  <div className="flex flex-col sm:flex-row items-start gap-4">
                    <img
                      src={visit.spaceImage}
                      alt={visit.spaceTitle}
                      className="w-full sm:w-36 h-28 object-cover rounded-2xl bg-slate-100 shrink-0"
                    />

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                          {visit.id}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Visita confirmada
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 capitalize flex items-center gap-1">
                          {visit.modality === 'presencial' ? (
                            <>
                              <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                              Presencial
                            </>
                          ) : (
                            <>
                              <Video className="w-3.5 h-3.5 text-indigo-600" />
                              Virtual
                            </>
                          )}
                        </span>
                      </div>

                      <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                        {visit.spaceTitle}
                      </h3>

                      <div className="space-y-1 text-xs text-slate-600">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="flex items-center gap-1 font-semibold text-slate-800">
                            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                            {visit.visitDate} ({visit.visitTimeSlot})
                          </span>
                          <span className="flex items-center gap-1 text-slate-500">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            {visit.attendeesCount} asistente{visit.attendeesCount > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="text-slate-500">
                          <strong>Ubicación:</strong> {visit.spaceAddress}
                        </div>
                        <div className="text-slate-500">
                          <strong>Anfitrión:</strong> {visit.ownerName}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end lg:self-center">
                    <button
                      onClick={() => onNavigate('home')}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
                    >
                      Ver catálogo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </TabPanel>

      {/* Modal de Detalle Completo de Reserva */}
      {selectedBookingDetail && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedBookingDetail(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 text-white p-6 flex items-start justify-between">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-400/30 mb-2">
                  Comprobante oficial de reserva
                </span>
                <h3 className="text-lg sm:text-xl font-bold">{selectedBookingDetail.spaceTitle}</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Código Reserva: #{selectedBookingDetail.id} · Emitida el{' '}
                  {new Date(selectedBookingDetail.createdAt).toLocaleDateString('es-CL')}
                </p>
              </div>
              <button
                onClick={() => setSelectedBookingDetail(null)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block font-semibold">Arrendatario titular</span>
                  <span className="font-bold text-slate-900 text-sm">{selectedBookingDetail.tenantName}</span>
                  <span className="block font-mono text-slate-600">
                    RUT: {formatRut(selectedBookingDetail.tenantRut)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Propietario / anfitrión</span>
                  <span className="font-bold text-slate-900 text-sm">{selectedBookingDetail.ownerName}</span>
                  <span className="block text-slate-600">{selectedBookingDetail.spaceAddress}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Periodo reservado</span>
                  <span className="font-bold text-slate-900">
                    {selectedBookingDetail.startDate} al {selectedBookingDetail.endDate}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Estado de reserva</span>
                  <span className="font-bold text-emerald-700">
                    {selectedBookingDetail.status === 'confirmed'
                      ? 'Confirmada por el anfitrión'
                      : selectedBookingDetail.status === 'pending'
                      ? 'Pendiente de confirmación'
                      : 'Cancelada / rechazada'}
                  </span>
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-200 pt-4">
                <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Desglose de pago (CLP)
                </div>
                <div className="flex justify-between py-1 text-slate-600">
                  <span>Subtotal arriendo recinto</span>
                  <span className="font-semibold text-slate-900">
                    {formatClp(selectedBookingDetail.subtotalClp)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-slate-600">
                  <span>Comisión servicio Spotly (5%)</span>
                  <span className="font-semibold text-slate-900">
                    {formatClp(selectedBookingDetail.platformFeeClp)}
                  </span>
                </div>
                {selectedBookingDetail.securityDepositClp > 0 && (
                  <div className="flex justify-between py-1 text-slate-600">
                    <span>Garantía (reembolsable)</span>
                    <span className="font-semibold text-slate-900">
                      {formatClp(selectedBookingDetail.securityDepositClp)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between p-3 bg-slate-100 rounded-xl font-extrabold text-sm text-slate-900">
                  <span>Total reserva</span>
                  <span className="text-rose-600">{formatClp(selectedBookingDetail.totalClp)}</span>
                </div>
              </div>

              {selectedBookingDetail.paymentSimulation && (
                <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900">
                  <span className="flex items-center gap-2 font-semibold">
                    <CreditCard className="w-4 h-4 text-emerald-600" />
                    Pagado con {selectedBookingDetail.paymentSimulation.cardBrand.toUpperCase()} ****{' '}
                    {selectedBookingDetail.paymentSimulation.last4}
                  </span>
                  <span className="font-mono text-[11px]">
                    Aut: {selectedBookingDetail.paymentSimulation.authorizationCode}
                  </span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => downloadReservationDocument(selectedBookingDetail)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar reserva
                </button>
                <button
                  onClick={() => handleDownloadContract(selectedBookingDetail)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar contrato
                </button>
              </div>
              <button
                onClick={() => setSelectedBookingDetail(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Disputa */}
      {disputeReservationId && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">Abrir disputa con el anfitrión</h3>
            <p className="text-xs text-slate-500">
              Explica el motivo del problema. El equipo de administración revisará el contrato y determinará la devolución de la garantía.
            </p>

            <form onSubmit={handleSendDispute} className="space-y-3">
              <textarea
                rows={4}
                required
                placeholder="Describe los hechos con detalle..."
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                className="w-full p-3 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDisputeReservationId(null)}
                  className="px-4 py-2 border border-slate-200 text-xs font-semibold rounded-xl text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Ingresar reclamo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para visualizar el contrato digital */}
      <ContractModal
        contract={selectedContract}
        isOpen={Boolean(selectedContract)}
        onClose={() => setSelectedContract(null)}
      />
    </div>
  );
};
