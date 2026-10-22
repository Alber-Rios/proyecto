import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { AlertTriangle, CalendarCheck, Check, Clock, Loader2, X } from 'lucide-react';
import type { Reservation } from '../types.ts';
import { formatClp } from '../utils/formatters.ts';

export type PaymentOutcome = 'exito' | 'rechazado' | 'anulado' | 'expirado' | 'error';

interface BookingResultModalProps {
  outcome: PaymentOutcome;
  reservation?: Reservation;
  loading?: boolean;
  onFinish: () => void;
  onViewBookings: () => void;
  onRetry?: () => void;
}

const formatDay = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const describeWhen = (r: Reservation) => {
  if (r.rentalModality === 'por_hora' && r.hourStart != null && r.hourEnd != null) {
    return `${formatDay(r.startDate)} · ${String(r.hourStart).padStart(2, '0')}:00 a ${String(r.hourEnd).padStart(2, '0')}:00`;
  }
  return r.startDate === r.endDate ? formatDay(r.startDate) : `${formatDay(r.startDate)} al ${formatDay(r.endDate)}`;
};

// Resultado de la reserva al terminar el pago (Webpay o tarjeta guardada).
export const BookingResultModal: React.FC<BookingResultModalProps> = ({
  outcome,
  reservation,
  loading,
  onFinish,
  onViewBookings,
  onRetry,
}) => {
  const success = outcome === 'exito';
  // Pagada pero el anfitrión debe aceptarla: queda en lista de espera.
  const waitlisted = success && reservation?.status === 'pending';

  const content = (() => {
    if (loading) {
      return {
        tone: 'neutral' as const,
        icon: <Loader2 className="w-8 h-8 animate-spin" />,
        title: 'Confirmando tu pago…',
        text: 'Estamos verificando el resultado con Webpay. Esto toma solo unos segundos.',
      };
    }
    if (waitlisted) {
      return {
        tone: 'amber' as const,
        icon: <Clock className="w-8 h-8" />,
        title: 'Pago recibido: estás en lista de espera',
        text: 'El anfitrión debe aceptar tu solicitud. Te avisaremos apenas responda. Si la rechaza, se te devuelve el monto pagado.',
      };
    }
    if (success) {
      return {
        tone: 'emerald' as const,
        icon: <Check className="w-9 h-9" strokeWidth={3} />,
        title: '¡Reserva exitosa!',
        text: 'Tu pago fue aprobado y la reserva quedó confirmada con su contrato firmado.',
      };
    }
    if (outcome === 'rechazado') {
      return {
        tone: 'red' as const,
        icon: <X className="w-9 h-9" strokeWidth={3} />,
        title: 'Reserva rechazada: pago no aprobado',
        text: 'Tu banco no autorizó el pago. La causa más común es saldo o cupo insuficiente. No se hizo ningún cargo y el horario quedó libre para que lo intentes de nuevo.',
      };
    }
    if (outcome === 'anulado') {
      return {
        tone: 'red' as const,
        icon: <X className="w-9 h-9" strokeWidth={3} />,
        title: 'Pago anulado',
        text: 'Cancelaste el pago en Webpay. No se hizo ningún cargo y la reserva no se registró.',
      };
    }
    if (outcome === 'expirado') {
      return {
        tone: 'red' as const,
        icon: <AlertTriangle className="w-8 h-8" />,
        title: 'La reserva expiró',
        text: 'El tiempo para pagar se agotó y el horario se liberó. Si alcanzó a cobrarse, el monto se reversó automáticamente.',
      };
    }
    return {
      tone: 'red' as const,
      icon: <AlertTriangle className="w-8 h-8" />,
      title: 'No pudimos confirmar el pago',
      text: 'Revisa el estado en Mis reservas. Si ves un cargo sin reserva, contáctanos desde Ayuda y soporte.',
    };
  })();

  const toneClasses = {
    neutral: 'bg-slate-100 text-slate-600',
    emerald: 'bg-emerald-500 text-white',
    amber: 'bg-amber-400 text-slate-900',
    red: 'bg-red-600 text-white',
  }[content.tone];

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl text-center space-y-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="booking-result-title"
        aria-describedby="booking-result-text"
      >
        <motion.div
          key={`${content.title}`}
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 16, delay: 0.1 }}
          className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center shadow-md ${toneClasses}`}
        >
          {content.icon}
        </motion.div>

        <div className="space-y-1.5">
          <h2 id="booking-result-title" className="text-xl font-semibold text-slate-900">
            {content.title}
          </h2>
          <p id="booking-result-text" className="text-sm text-slate-600 leading-relaxed">
            {content.text}
          </p>
        </div>

        {reservation && !loading && (success || outcome === 'rechazado') && (
          <div className="text-left p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1 text-xs">
            <div className="font-semibold text-slate-900 truncate">{reservation.spaceTitle}</div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <CalendarCheck className="w-3.5 h-3.5 text-slate-400" /> {describeWhen(reservation)}
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-500">{success ? 'Total pagado' : 'Total'}</span>
              <span className="font-semibold text-slate-900">{formatClp(reservation.totalClp)}</span>
            </div>
            <div className="text-[11.5px] font-mono text-slate-400">Reserva #{reservation.id.slice(-6)}</div>
          </div>
        )}

        {!loading && (
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={onFinish}
              className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 text-slate-800 font-semibold text-sm hover:bg-slate-50 cursor-pointer"
            >
              Finalizar
            </button>
            <button
              type="button"
              autoFocus
              onClick={onViewBookings}
              className="flex-1 px-4 py-3 rounded-2xl bg-slate-900 hover:bg-black text-white font-semibold text-sm cursor-pointer"
            >
              Ver mis reservas
            </button>
          </div>
        )}
        {!loading && !success && onRetry && (
          <button type="button" onClick={onRetry} className="text-xs font-semibold text-brand-600 hover:underline cursor-pointer">
            Intentar de nuevo con otro medio de pago
          </button>
        )}
      </motion.div>
    </div>,
    document.body
  );
};
