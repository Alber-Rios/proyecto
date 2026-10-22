import React, { useMemo, useState } from 'react';
import { Reservation, Review } from '../types.ts';
import { useApp } from '../context/AppContext.tsx';
import { calculateRefund } from '../utils/refundPolicy.ts';
import { formatClp, getTodayIso } from '../utils/formatters.ts';
import { insertReviewToDb } from '../lib/dataAccess.ts';
import { isReservationFinished } from '../utils/reviewEligibility.ts';
import { CreditCard, Loader2, Star, XCircle, X } from 'lucide-react';

const PAYMENT_LABELS: Record<string, { text: string; className: string }> = {
  pending: { text: 'Pago pendiente', className: 'bg-amber-100 text-amber-800' },
  paid: { text: 'Pagado con Webpay', className: 'bg-emerald-100 text-emerald-800' },
  failed: { text: 'Pago no completado', className: 'bg-rose-100 text-rose-800' },
  refund_pending: { text: 'Reembolso en proceso', className: 'bg-indigo-100 text-indigo-800' },
  refunded: { text: 'Reembolsado', className: 'bg-indigo-100 text-indigo-800' },
  partially_refunded: { text: 'Reembolso parcial', className: 'bg-indigo-100 text-indigo-800' },
  not_required: { text: 'Sin pago', className: 'bg-slate-100 text-slate-700' },
  legacy_simulated: { text: 'Pago simulado (prototipo anterior)', className: 'bg-slate-100 text-slate-600' },
};

export const PaymentStatusBadge: React.FC<{ reservation: Reservation }> = ({ reservation }) => {
  const label = PAYMENT_LABELS[reservation.paymentStatus || 'legacy_simulated'];
  if (!label) return null;
  return <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${label.className}`}>{label.text}</span>;
};

export function reservationStatusLabel(reservation: Reservation): string {
  if (reservation.status === 'pending' && reservation.paymentStatus === 'pending') return 'Esperando pago';
  if (reservation.status === 'pending') return 'Pendiente de aceptación del anfitrión';
  if (reservation.status === 'confirmed') return 'Confirmada';
  if (reservation.status === 'completed') return 'Finalizada';
  if (reservation.status === 'rejected') return 'Rechazada por el anfitrión';
  return 'Cancelada';
}

const PAYMENT_HOLD_MINUTES = 20;

interface ReservationActionsProps {
  reservation: Reservation;
  existingReview?: Review;
  onReviewed?: (review: Review) => void;
}

// Acciones del arrendatario sobre una reserva: pagar, cancelar (RF-18) y valorar (RF-29).
export const ReservationActions: React.FC<ReservationActionsProps> = ({ reservation, existingReview, onReviewed }) => {
  const { currentUser, startWebpayPayment, cancelReservation } = useApp();
  const [busy, setBusy] = useState<'pay' | 'cancel' | 'review' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const holdActive =
    reservation.status === 'pending' &&
    reservation.paymentStatus === 'pending' &&
    Date.now() - new Date(reservation.createdAt).getTime() < PAYMENT_HOLD_MINUTES * 60000;

  const canCancel = reservation.status === 'pending' || reservation.status === 'confirmed';
  const finished = isReservationFinished(reservation);
  const canReview = finished && !existingReview;

  const refundPreview = useMemo(
    () =>
      calculateRefund(
        {
          startDate: reservation.startDate,
          hourStart: reservation.hourStart,
          subtotalClp: reservation.subtotalClp,
          discountClp: reservation.discountClp,
          securityDepositClp: reservation.securityDepositClp,
          totalClp: reservation.totalClp,
        },
        'tenant'
      ),
    [reservation]
  );
  const unpaid = reservation.paymentStatus === 'pending' || reservation.paymentStatus === 'failed';

  const run = async (kind: 'pay' | 'cancel' | 'review', action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {holdActive && (
        <button
          onClick={() => run('pay', () => startWebpayPayment(reservation.id))}
          disabled={busy !== null}
          className="w-full sm:w-auto px-3.5 py-2.5 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
        >
          {busy === 'pay' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
          Pagar ahora
        </button>
      )}

      {canCancel && (
        <button
          onClick={() => setShowCancel(true)}
          className="w-full sm:w-auto px-3 py-2.5 sm:py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
        >
          <XCircle className="w-3.5 h-3.5" /> Cancelar reserva
        </button>
      )}

      {canReview && (
        <button
          onClick={() => setShowReview(true)}
          className="w-full sm:w-auto px-3 py-2.5 sm:py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer"
        >
          <Star className="w-3.5 h-3.5" /> Valorar espacio
        </button>
      )}
      {existingReview && (
        <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Valoraste con {existingReview.rating}/5
        </span>
      )}

      {error && !showCancel && !showReview && (
        <p className="w-full text-[11px] font-semibold text-rose-600">{error}</p>
      )}

      {showCancel && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between">
              <h3 className="text-base font-bold text-slate-900">Cancelar reserva #{reservation.id.slice(-6)}</h3>
              <button onClick={() => setShowCancel(false)} aria-label="Cerrar" className="cursor-pointer">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            {unpaid ? (
              <p className="text-xs text-slate-600">
                Esta reserva no tiene un pago aprobado: se anulará y el horario quedará disponible sin cargos.
              </p>
            ) : (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <p className="text-xs text-slate-700">{refundPreview.description}</p>
                <p className="text-sm font-bold text-slate-900">
                  Reembolso estimado: {formatClp(refundPreview.refundClp)}
                </p>
                <p className="text-[11px] text-slate-500">
                  El monto definitivo lo calcula el servidor al confirmar, según la hora exacta de la cancelación.
                </p>
              </div>
            )}
            <textarea
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo de la cancelación (opcional)"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
            {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCancel(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Volver
              </button>
              <button
                onClick={() =>
                  run('cancel', async () => {
                    await cancelReservation(reservation.id, cancelReason);
                    setShowCancel(false);
                  })
                }
                disabled={busy !== null}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {busy === 'cancel' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirmar cancelación
              </button>
            </div>
          </div>
        </div>
      )}

      {showReview && currentUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between">
              <h3 className="text-base font-bold text-slate-900">Valorar “{reservation.spaceTitle}”</h3>
              <button onClick={() => setShowReview(false)} aria-label="Cerrar" className="cursor-pointer">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="flex gap-1" role="radiogroup" aria-label="Calificación">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={`${value} estrellas`}
                  onClick={() => setRating(value)}
                  className="cursor-pointer"
                >
                  <Star className={`w-7 h-7 ${value <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                </button>
              ))}
            </div>
            <textarea
              rows={3}
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Cuéntanos cómo fue tu experiencia (opcional)"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
            {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowReview(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() =>
                  run('review', async () => {
                    const review = await insertReviewToDb({
                      spaceId: reservation.spaceId,
                      reservationId: reservation.id,
                      tenantId: currentUser.id,
                      tenantName: currentUser.fullName,
                      rating,
                      comment: comment.trim() || undefined,
                    });
                    onReviewed?.(review);
                    setShowReview(false);
                  })
                }
                disabled={busy !== null}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {busy === 'review' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Publicar valoración
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
