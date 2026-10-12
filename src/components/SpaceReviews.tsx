import React, { useEffect, useState } from 'react';
import { Review, Space } from '../types.ts';
import { useApp } from '../context/AppContext.tsx';
import { getReviewsForSpace, replyToReviewInDb } from '../lib/dataAccess.ts';
import { Star, MessageSquare, Loader2 } from 'lucide-react';

// Valoraciones del espacio y respuestas del propietario (RF-29).
export const SpaceReviews: React.FC<{ space: Space }> = ({ space }) => {
  const { currentUser } = useApp();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

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

  return (
    <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4" aria-labelledby="space-reviews-title">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="space-reviews-title" className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500" /> Valoraciones
        </h2>
        {reviews.length > 0 ? (
          <span className="text-sm font-black text-slate-900">
            {average.toFixed(1)} / 5 · {reviews.length} {reviews.length === 1 ? 'opinión' : 'opiniones'}
          </span>
        ) : (
          <span className="text-xs font-semibold text-slate-500">Aún sin valoraciones</span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-slate-500">Cargando valoraciones…</p>
      ) : reviews.length === 0 ? (
        <p className="text-xs text-slate-500">
          Las valoraciones las publican arrendatarios que completaron una reserva en este espacio.
        </p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((review) => (
            <li key={review.id} className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">{review.tenantName}</span>
                <span className="text-[11px] text-slate-500">{new Date(review.createdAt).toLocaleDateString('es-CL')}</span>
              </div>
              <div className="flex gap-0.5" aria-label={`${review.rating} de 5 estrellas`}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Star
                    key={value}
                    className={`w-3.5 h-3.5 ${value <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                  />
                ))}
              </div>
              {review.comment && <p className="text-xs text-slate-700 leading-relaxed">{review.comment}</p>}

              {review.ownerReply && replyDrafts[review.id] === undefined && (
                <div className="ml-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[11px] font-bold text-slate-900 flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5" /> Respuesta de {space.ownerName}
                  </p>
                  <p className="text-xs text-slate-700">{review.ownerReply}</p>
                </div>
              )}

              {isOwner && (
                replyDrafts[review.id] !== undefined ? (
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
                        className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleReply(review)}
                        disabled={savingId === review.id}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {savingId === review.id && <Loader2 className="w-3 h-3 animate-spin" />} Publicar respuesta
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setReplyDrafts((prev) => ({ ...prev, [review.id]: review.ownerReply || '' }))}
                    className="ml-4 text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                  >
                    {review.ownerReply ? 'Editar respuesta' : 'Responder'}
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
    </section>
  );
};
