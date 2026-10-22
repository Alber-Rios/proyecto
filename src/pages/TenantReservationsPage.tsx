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
          <div className="w-16 h-16 bg-brand-50 text-brand-600 rounded-3xl flex items-center justify-center mx-auto shadow-xs">
            <FileText className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-800 bg-brand-50 px-3 py-1 rounded-full border border-brand-200">
              Acceso a mis arriendos
            </span>
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
              Inicia sesión para ver tus reservas
            </h2>
            <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              Tus solicitudes de arriendo, contratos digitales suscritos bajo la Ley 18.101 y comprobantes de reserva están asociados a tu cuenta.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => onOpenAuth?.('login', 'Inicia sesión para acceder a tu historial de arriendos.')}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-slate-900 hover:bg-black text-white font-semibold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => onOpenAuth?.('register', 'Crea tu cuenta de Arrendatario para reservar espacios en Chile.')}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
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
          <div className="w-14 h-14 bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold text-slate-900">Sesión de administrador activa</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              La cuenta de Administrador no realiza reservas personales. Dirígete al Panel de Administración para auditar usuarios, moderar espacios y revisar disputas.
            </p>
          </div>
          <button
            onClick={() => onNavigate('admin')}
            className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs transition cursor-pointer"
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

  const dayFmt = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtDay = (iso: string) => dayFmt.format(new Date(`${iso}T12:00:00`)).replace('.', '');
  const hh = (h?: number) => `${String(h ?? 0).padStart(2, '0')}:00`;
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const describeWhen = (b: Reservation) => cap(describeWhenRaw(b));
  const describeWhenRaw = (b: Reservation) => {
    if (b.rentalModality === 'por_hora' && b.hourStart != null && b.hourEnd != null) {
      return `${fmtDay(b.startDate)} · ${hh(b.hourStart)} a ${hh(b.hourEnd)}`;
    }
    if (b.startDate === b.endDate) return fmtDay(b.startDate);
    return `${fmtDay(b.startDate)} al ${fmtDay(b.endDate)}`;
  };
  const durationLabel = (b: Reservation) =>
    b.rentalModality === 'por_hora'
      ? `${b.durationUnits || 1} ${(b.durationUnits || 1) === 1 ? 'hora' : 'horas'}`
      : b.rentalModality === 'mensual'
        ? `${b.durationUnits || 1} ${(b.durationUnits || 1) === 1 ? 'mes' : 'meses'}`
        : `${b.totalDays} ${b.totalDays === 1 ? 'día' : 'días'}`;

  const statusTone = (b: Reservation) =>
    b.status === 'confirmed'
      ? 'bg-emerald-50 text-emerald-800'
      : b.status === 'completed'
        ? 'bg-slate-100 text-slate-700'
        : b.status === 'pending'
          ? 'bg-amber-50 text-amber-800'
          : 'bg-red-50 text-red-700';

  const quiet =
    'inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-800 transition-colors hover:border-slate-400 cursor-pointer';

  const renderBooking = (booking: Reservation) => (
    <article
      key={booking.id}
      id={`reserva-${booking.id}`}
      className={`grid gap-5 rounded-[1.5rem] border bg-white p-4 transition-shadow sm:grid-cols-[200px_1fr] sm:p-5 hover:shadow-md ${
        booking.id === highlightId ? 'border-brand-400 ring-4 ring-brand-100' : 'border-slate-200'
      }`}
    >
      <button
        type="button"
        onClick={() => routerNavigate(`/space/${encodeURIComponent(booking.spaceId)}`)}
        className="relative block aspect-[4/3] overflow-hidden rounded-2xl bg-slate-100 cursor-pointer sm:aspect-auto sm:h-full sm:min-h-[150px]"
        aria-label={`Ver ${booking.spaceTitle}`}
      >
        {booking.spaceImage && <img src={booking.spaceImage} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      </button>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${statusTone(booking)}`}>{reservationStatusLabel(booking)}</span>
          <PaymentStatusBadge reservation={booking} />
          {booking.disputeStatus === 'opened' && (
            <span className="rounded-full bg-red-600 px-2.5 py-1 text-[12px] font-semibold text-white">Disputa abierta</span>
          )}
          <span className="ml-auto text-[12px] text-slate-400 tabular">#{booking.id.slice(-6)}</span>
        </div>

        <div className="min-w-0">
          <h3 className="truncate text-[17px] font-semibold text-slate-950">{booking.spaceTitle}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-slate-700">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Calendar className="h-4 w-4 text-slate-400" /> {describeWhen(booking)}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">{durationLabel(booking)}</span>
          </p>
          <p className="mt-1 text-[13.5px] text-slate-500">
            Anfitrión {booking.ownerName}
            {booking.spaceAddress ? ` · ${booking.spaceAddress}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13.5px] text-slate-600 tabular">
          <span>
            Total <strong className="font-semibold text-slate-950">{formatClp(booking.totalClp)}</strong>
          </span>
          {booking.securityDepositClp > 0 && <span>Garantía {formatClp(booking.securityDepositClp)}</span>}
          {booking.discountClp ? (
            <span className="text-emerald-700">
              Descuento {booking.discountCode} −{formatClp(booking.discountClp)}
            </span>
          ) : null}
          {booking.refundAmountClp !== undefined && booking.refundAmountClp > 0 && (
            <span className="text-slate-700">Reembolso {formatClp(booking.refundAmountClp)}</span>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <button type="button" onClick={() => setSelectedBookingDetail(booking)} className={quiet}>
            <Eye className="h-4 w-4 text-slate-500" /> Detalle
          </button>
          <button type="button" onClick={() => handleOpenContract(booking)} className={quiet}>
            <FileText className="h-4 w-4 text-slate-500" /> Contrato
          </button>
          <button
            type="button"
            onClick={() => downloadReservationDocument(booking)}
            className={quiet}
            title="Descargar el comprobante de la reserva"
          >
            <Download className="h-4 w-4 text-slate-500" /> Comprobante
          </button>
          <button
            type="button"
            onClick={() => handleDownloadContract(booking)}
            className={quiet}
            title="Descargar el contrato de arrendamiento firmado"
          >
            <Download className="h-4 w-4 text-slate-500" /> Contrato PDF
          </button>
          <ReservationActions
            reservation={booking}
            existingReview={myReviews.find((r) => r.reservationId === booking.id)}
            onReviewed={(review) => setMyReviews((prev) => [review, ...prev])}
          />
          {booking.disputeStatus !== 'opened' && (
            <button
              type="button"
              onClick={() => setDisputeReservationId(booking.id)}
              className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-slate-500 underline-offset-4 hover:text-red-700 hover:underline cursor-pointer"
            >
              <Scale className="h-3.5 w-3.5" /> Reportar un problema
            </button>
          )}
        </div>
      </div>
    </article>
  );

  const tabs = [
    { id: 'confirmed' as const, label: 'Reservas', count: confirmedBookings.length },
    { id: 'waitlist' as const, label: 'Lista de espera', count: waitlistBookings.length },
    { id: 'visits' as const, label: 'Visitas', count: myVisits.length },
  ];

  const emptyState = (title: string, text: string, action?: { label: string; onClick: () => void }) => (
    <div className="rounded-[1.5rem] bg-slate-50 px-6 py-14 text-center">
      <h3 className="text-[17px] font-semibold text-slate-950">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-[15px] text-slate-600">{text}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-[14px] font-semibold text-white hover:bg-slate-800 cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16 pt-4 sm:pt-8">
      {/* Cabecera */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[2rem] font-semibold tracking-[-0.035em] text-slate-950 sm:text-[2.5rem]">Mis reservas</h1>
          <p className="mt-1.5 max-w-xl text-[15px] text-slate-600">
            Tus arriendos, contratos firmados y comprobantes, en un solo lugar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onNavigate('support')} className={quiet}>
            <Scale className="h-4 w-4 text-slate-500" /> Ayuda
          </button>
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-4 py-2 text-[13px] font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            <Building className="h-4 w-4" /> Buscar espacios
          </button>
        </div>
      </header>

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

      {/* Pestañas */}
      <div className="flex gap-6 border-b border-slate-200" role="tablist" aria-label="Tipo de reserva">
        {tabs.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(t.id)}
              className={`relative -mb-px flex items-center gap-2 pb-3 text-[15px] font-medium transition-colors cursor-pointer ${
                active ? 'text-slate-950' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t.label}
              <span
                className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-[12px] tabular ${
                  active ? 'bg-slate-950 text-white' : t.id === 'waitlist' && t.count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {t.count}
              </span>
              {active && <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-slate-950" />}
            </button>
          );
        })}
      </div>

      {activeTab === 'confirmed' ? (
        <div className="space-y-4">
          {confirmedBookings.length === 0
            ? emptyState(
                'Aún no tienes reservas confirmadas',
                waitlistBookings.length > 0
                  ? `Tienes ${waitlistBookings.length} ${waitlistBookings.length === 1 ? 'solicitud' : 'solicitudes'} en lista de espera; aparecerán aquí cuando el anfitrión las acepte.`
                  : 'Cuando reserves un espacio, aquí verás el horario, el contrato y el comprobante.',
                waitlistBookings.length > 0
                  ? { label: 'Ver lista de espera', onClick: () => setActiveTab('waitlist') }
                  : { label: 'Buscar espacios', onClick: () => onNavigate('home') }
              )
            : confirmedBookings.map(renderBooking)}

          {closedBookings.length > 0 && (
            <div className="space-y-4 pt-2">
              <button
                type="button"
                onClick={() => setShowClosed((v) => !v)}
                className="text-[14px] font-medium text-slate-600 underline underline-offset-4 hover:text-slate-950 cursor-pointer"
                aria-expanded={showClosed}
              >
                {showClosed ? 'Ocultar' : 'Ver'} canceladas o rechazadas ({closedBookings.length})
              </button>
              {showClosed && <div className="space-y-4 opacity-75">{closedBookings.map(renderBooking)}</div>}
            </div>
          )}
        </div>
      ) : activeTab === 'waitlist' ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-[14px] text-amber-950">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p>
              Tus solicitudes esperan la respuesta del anfitrión. Si las acepta, pasan solas a <strong>Reservas</strong>; si las rechaza o no
              responde antes del inicio, se cancelan y se te devuelve el 100 % de lo pagado.
            </p>
          </div>
          {waitlistBookings.length === 0
            ? emptyState('No tienes solicitudes en espera', 'Los espacios con aprobación del anfitrión aparecen aquí mientras él decide.')
            : waitlistBookings.map(renderBooking)}
        </div>
      ) : (
        <div className="space-y-4">
          {myVisits.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
              <MapPin className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-semibold text-slate-800">No tienes visitas agendadas</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Puedes agendar una visita presencial o virtual gratuita desde la ficha de cualquier espacio.
              </p>
              <button
                onClick={() => onNavigate('home')}
                className="mt-2 px-5 py-2.5 bg-brand-600 text-white font-semibold text-xs rounded-xl hover:bg-brand-700 transition inline-flex items-center gap-2 cursor-pointer"
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
                        <span className="font-mono text-xs font-semibold text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
                          {visit.id}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[12.5px] font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Visita confirmada
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[12.5px] font-semibold bg-slate-100 text-slate-700 capitalize flex items-center gap-1">
                          {visit.modality === 'presencial' ? (
                            <>
                              <MapPin className="w-3.5 h-3.5 text-brand-600" />
                              Presencial
                            </>
                          ) : (
                            <>
                              <Video className="w-3.5 h-3.5 text-brand-600" />
                              Virtual
                            </>
                          )}
                        </span>
                      </div>

                      <h3 className="text-base sm:text-lg font-semibold text-slate-900 leading-snug">
                        {visit.spaceTitle}
                      </h3>

                      <div className="space-y-1 text-xs text-slate-600">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="flex items-center gap-1 font-semibold text-slate-800">
                            <Calendar className="w-3.5 h-3.5 text-brand-500" />
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
                      className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold transition cursor-pointer shadow-xs"
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

      {!currentUser.ownerTermsAccepted && currentUser.role === 'tenant' && (
        <div className="flex flex-col items-start justify-between gap-4 rounded-[1.5rem] bg-slate-50 p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-950">¿Tienes un espacio que pasa vacío?</h2>
            <p className="mt-1 text-[14px] text-slate-600">Actívate como propietario y publícalo por hora, día o mes.</p>
          </div>
          <button
            type="button"
            onClick={onOpenOwnerUpgrade}
            className="shrink-0 rounded-full border border-slate-950 px-4 py-2 text-[13px] font-semibold text-slate-950 hover:bg-white cursor-pointer"
          >
            Quiero publicar
          </button>
        </div>
      )}

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
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold uppercase tracking-wider bg-brand-500/20 text-brand-300 border border-brand-400/30 mb-2">
                  Comprobante oficial de reserva
                </span>
                <h3 className="text-lg sm:text-xl font-semibold">{selectedBookingDetail.spaceTitle}</h3>
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
                  <span className="font-semibold text-slate-900 text-sm">{selectedBookingDetail.tenantName}</span>
                  <span className="block font-mono text-slate-600">
                    RUT: {formatRut(selectedBookingDetail.tenantRut)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Propietario / anfitrión</span>
                  <span className="font-semibold text-slate-900 text-sm">{selectedBookingDetail.ownerName}</span>
                  <span className="block text-slate-600">{selectedBookingDetail.spaceAddress}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Periodo reservado</span>
                  <span className="font-semibold text-slate-900">
                    {selectedBookingDetail.startDate} al {selectedBookingDetail.endDate}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Estado de reserva</span>
                  <span className="font-semibold text-emerald-700">
                    {selectedBookingDetail.status === 'confirmed'
                      ? 'Confirmada por el anfitrión'
                      : selectedBookingDetail.status === 'pending'
                      ? 'Pendiente de confirmación'
                      : 'Cancelada / rechazada'}
                  </span>
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-200 pt-4">
                <div className="font-semibold text-slate-800 uppercase tracking-wider text-[12.5px]">
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
                <div className="flex justify-between p-3 bg-slate-100 rounded-xl font-semibold text-sm text-slate-900">
                  <span>Total reserva</span>
                  <span className="text-brand-600">{formatClp(selectedBookingDetail.totalClp)}</span>
                </div>
              </div>

              {selectedBookingDetail.paymentSimulation && (
                <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900">
                  <span className="flex items-center gap-2 font-semibold">
                    <CreditCard className="w-4 h-4 text-emerald-600" />
                    Pagado con {selectedBookingDetail.paymentSimulation.cardBrand.toUpperCase()} ****{' '}
                    {selectedBookingDetail.paymentSimulation.last4}
                  </span>
                  <span className="font-mono text-[12.5px]">
                    Aut: {selectedBookingDetail.paymentSimulation.authorizationCode}
                  </span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => downloadReservationDocument(selectedBookingDetail)}
                  className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar reserva
                </button>
                <button
                  onClick={() => handleDownloadContract(selectedBookingDetail)}
                  className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
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
            <h3 className="text-base font-semibold text-slate-900">Abrir disputa con el anfitrión</h3>
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
                className="w-full p-3 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-hidden"
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
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
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
