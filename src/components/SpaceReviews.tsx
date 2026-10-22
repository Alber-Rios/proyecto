import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Review, Reservation, Space } from '../types.ts';
import { useApp } from '../context/AppContext.tsx';
import { getReviewsForSpace, insertReviewToDb, replyToReviewInDb, updateReviewInDb } from '../lib/dataAccess.ts';
import { isReservationFinished } from '../utils/reviewEligibility.ts';
import { Star, MessageSquare, Loader2, PenLine, CalendarClock, LogIn } from 'lucide-react';

const formatDay = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const RATING_LABELS = ['', 'Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente'];

// Selector de estrellas accesible (radiogroup) con vista previa al pasar el cursor.
const StarPicker: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1" role="radiogroup" aria-label="Calificación" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((v) => (
          <motion.button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            aria-label={`${v} ${v === 1 ? 'estrella' : 'estrellas'}`}
            onClick={() => onChange(v)}
            onMouseEnter={() => setHover(v)}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            className="cursor-pointer p-0.5"
          >
            <Star className={`w-7 h-7 transition-colors ${v <= shown ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
          </motion.button>
        ))}
      </div>
      <span className="text-xs font-semibold text-slate-700 min-w-[72px]">{RATING_LABELS[shown]}</span>
    </div>
  );
};

const Stars: React.FC<{ rating: number; size?: string }> = ({ rating, size = 'w-3.5 h-3.5' }) => (
  <div className="flex gap-0.5" aria-label={`${rating} de 5 estrellas`}>
    {[1, 2, 3, 4, 5].map((v) => (
      <Star key={v} className={`${size} ${v <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
    ))}
  </div>
);

// Valoraciones del espacio: resumen, formulario para quien ya terminó una reserva,
// edición de la propia reseña y respuesta del propietario (RF-29).
export const SpaceReviews: React.FC<{ space: Space; onOpenAuth?: (mode: 'login' | 'register', notice?: string) => void }> = ({
  space,
  onOpenAuth,
}) => {
  const { currentUser, reservations } = useApp();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Formulario de nueva reseña / edición de la propia
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reservationId, setReservationId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);

  const isOwner = currentUser?.id === space.ownerId;

  useEffect(() => {
    let active = true;
    setLoading(true);
    getReviewsForSpace(space.id)
      .then((items) => {
        if (active) setReviews(items);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [space.id]);

  const myReservations = useMemo<Reservation[]>(
    () => (currentUser ? reservations.filter((r) => r.tenantId === currentUser.id && r.spaceId === space.id) : []),
    [reservations, currentUser, space.id]
  );
  const reviewedIds = useMemo(() => new Set(reviews.map((r) => r.reservationId)), [reviews]);
  const reviewable = useMemo(
    () => myReservations.filter((r) => isReservationFinished(r) && !reviewedIds.has(r.id)),
    [myReservations, reviewedIds]
  );
  const upcoming = useMemo(
    () =>
      myReservations
        .filter((r) => (r.status === 'pending' || r.status === 'confirmed') && !isReservationFinished(r))
        .sort((a, b) => a.endDate.localeCompare(b.endDate))[0],
    [myReservations]
  );

  useEffect(() => {
    if (!reservationId && reviewable[0]) setReservationId(reviewable[0].id);
  }, [reviewable, reservationId]);

  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  const distribution = [5, 4, 3, 2, 1].map((v) => ({ value: v, count: reviews.filter((r) => r.rating === v).length }));

  const resetForm = () => {
    setComposerOpen(false);
    setEditingId(null);
    setRating(0);
    setComment('');
    setFormError(null);
  };

  const startEdit = (review: Review) => {
    setEditingId(review.id);
    setRating(review.rating);
    setComment(review.comment || '');
    setFormError(null);
    setComposerOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (rating < 1) {
      setFormError('Elige de 1 a 5 estrellas.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (editingId) {
        const updated = await updateReviewInDb(editingId, { rating, comment });
        setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      } else {
        const created = await insertReviewToDb({
          spaceId: space.id,
          reservationId,
          tenantId: currentUser.id,
          tenantName: currentUser.fullName,
          rating,
          comment: comment.trim() || undefined,
        });
        setReviews((prev) => [created, ...prev]);
        setReservationId('');
        setThanks(true);
        window.setTimeout(() => setThanks(false), 5000);
      }
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar la reseña.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (review: Review) => {
    const text = (replyDrafts[review.id] ?? review.ownerReply ?? '').trim();
    setSavingId(review.id);
    setError(null);
    try {
      const updated = await replyToReviewInDb(review.id, text);
      setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setReplyDrafts((prev) => {
        const next = { ...prev };
        delete next[review.id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la respuesta.');
    } finally {
      setSavingId(null);
    }
  };

  // Qué puede hacer quien mira la página con respecto a reseñar este espacio.
  const callToAction = (() => {
    if (isOwner || composerOpen) return null;
    if (!currentUser) {
      return (
        <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
          <p className="text-xs text-slate-600">¿Arrendaste este lugar? Inicia sesión para dejar tu reseña.</p>
          {onOpenAuth && (
            <button
              type="button"
              onClick={() => onOpenAuth('login', 'Inicia sesión para dejar tu reseña.')}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" /> Iniciar sesión
            </button>
          )}
        </div>
      );
    }
    if (reviewable.length > 0) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-amber-50 border border-amber-200"
        >
          <p className="text-xs text-amber-900 font-semibold">
            ¿Cómo te fue en {space.title}? Tu opinión ayuda a otros arrendatarios.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setComposerOpen(true);
            }}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            <PenLine className="w-3.5 h-3.5" /> Escribir reseña
          </button>
        </motion.div>
      );
    }
    if (upcoming) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
          <CalendarClock className="w-4 h-4 text-slate-400 shrink-0" />
          Podrás dejar tu reseña cuando termine tu reserva del {formatDay(upcoming.endDate)}.
        </div>
      );
    }
    return null;
  })();

  return (
    <section className="space-y-5" aria-labelledby="space-reviews-title">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="space-reviews-title" className="text-[1.3rem] font-semibold tracking-[-0.02em] text-slate-950 flex items-center gap-2">
          <Star className="w-5 h-5 fill-slate-950 text-slate-950" /> {reviews.length > 0 ? `${average.toFixed(1).replace('.', ',')} · ${reviews.length} ${reviews.length === 1 ? 'reseña' : 'reseñas'}` : 'Reseñas'}
        </h2>
        {reviews.length === 0 && <span className="text-[14px] text-slate-500">Aún sin reseñas</span>}
      </div>

      {reviews.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center p-4 rounded-2xl bg-slate-50 border border-slate-100">
          <div className="text-center sm:pr-4 sm:border-r border-slate-200 shrink-0">
            <div className="text-3xl font-semibold text-slate-900">{average.toFixed(1).replace('.', ',')}</div>
            <Stars rating={average} size="w-4 h-4" />
            <div className="text-[12.5px] text-slate-500 mt-0.5">
              {reviews.length} {reviews.length === 1 ? 'reseña' : 'reseñas'}
            </div>
          </div>
          <ul className="flex-1 space-y-1" aria-label="Distribución de calificaciones">
            {distribution.map((d) => (
              <li key={d.value} className="flex items-center gap-2 text-[12.5px] text-slate-600">
                <span className="w-3 text-right font-semibold">{d.value}</span>
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-slate-900"
                    initial={{ width: 0 }}
                    animate={{ width: `${reviews.length ? (d.count / reviews.length) * 100 : 0}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
                <span className="w-5 text-right">{d.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AnimatePresence>
        {thanks && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2"
            role="status"
          >
            ¡Gracias! Tu reseña ya está publicada.
          </motion.p>
        )}
      </AnimatePresence>

      {callToAction}

      <AnimatePresence initial={false}>
        {composerOpen && currentUser && (
          <motion.form
            key="composer"
            onSubmit={handleSubmit}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-2xl border border-slate-200 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">{editingId ? 'Editar mi reseña' : 'Tu reseña'}</h3>
              {!editingId && reviewable.length > 1 && (
                <label className="block text-xs">
                  <span className="font-semibold text-slate-700 block mb-1">Reserva</span>
                  <select
                    value={reservationId}
                    onChange={(e) => setReservationId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                  >
                    {reviewable.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.startDate === r.endDate ? formatDay(r.startDate) : `${formatDay(r.startDate)} al ${formatDay(r.endDate)}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <StarPicker value={rating} onChange={setRating} />
              <textarea
                rows={3}
                maxLength={1000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Cuenta cómo fue tu experiencia: limpieza, ubicación, atención del propietario… (opcional)"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] text-slate-400">{comment.length}/1000</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || rating < 1}
                    className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {editingId ? 'Guardar cambios' : 'Publicar reseña'}
                  </button>
                </div>
              </div>
              {formError && (
                <p className="text-[12.5px] font-semibold text-red-600" role="alert">
                  {formError}
                </p>
              )}
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {loading ? (
        <p className="text-xs text-slate-500">Cargando reseñas…</p>
      ) : reviews.length === 0 ? (
        <p className="text-xs text-slate-500">
          Las reseñas las publican quienes ya arrendaron este espacio, una vez terminada su reserva.
        </p>
      ) : (
        <ul className="space-y-4">
          <AnimatePresence initial={false}>
            {reviews.map((review, index) => (
              <motion.li
                key={review.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index, 6) * 0.04 }}
                className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-slate-900 text-white text-[12.5px] font-semibold flex items-center justify-center">
                      {review.tenantName.charAt(0).toUpperCase()}
                    </span>
                    {review.tenantName}
                    {currentUser?.id === review.tenantId && (
                      <span className="text-[11.5px] font-semibold text-slate-500">(tú)</span>
                    )}
                  </span>
                  <span className="text-[12.5px] text-slate-500">{new Date(review.createdAt).toLocaleDateString('es-CL')}</span>
                </div>
                <Stars rating={review.rating} />
                {review.comment && <p className="text-xs text-slate-700 leading-relaxed">{review.comment}</p>}

                {currentUser?.id === review.tenantId && !composerOpen && (
                  <button
                    type="button"
                    onClick={() => startEdit(review)}
                    className="text-[12.5px] font-semibold text-slate-600 hover:text-slate-900 hover:underline cursor-pointer"
                  >
                    Editar mi reseña
                  </button>
                )}

                {review.ownerReply && replyDrafts[review.id] === undefined && (
                  <div className="ml-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-[12.5px] font-semibold text-slate-900 flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" /> Respuesta de {space.ownerName}
                    </p>
                    <p className="text-xs text-slate-700">{review.ownerReply}</p>
                  </div>
                )}

                {isOwner &&
                  (replyDrafts[review.id] !== undefined ? (
                    <div className="ml-4 space-y-2">
                      <textarea
                        rows={2}
                        maxLength={1000}
                        value={replyDrafts[review.id]}
                        onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [review.id]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                        placeholder="Escribe tu respuesta pública"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() =>
                            setReplyDrafts((prev) => {
                              const next = { ...prev };
                              delete next[review.id];
                              return next;
                            })
                          }
                          className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleReply(review)}
                          disabled={savingId === review.id}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {savingId === review.id && <Loader2 className="w-3 h-3 animate-spin" />} Publicar respuesta
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReplyDrafts((prev) => ({ ...prev, [review.id]: review.ownerReply || '' }))}
                      className="ml-4 text-[12.5px] font-semibold text-brand-600 hover:underline cursor-pointer"
                    >
                      {review.ownerReply ? 'Editar respuesta' : 'Responder'}
                    </button>
                  ))}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {error && <p className="text-[12.5px] font-semibold text-red-600">{error}</p>}
    </section>
  );
};
