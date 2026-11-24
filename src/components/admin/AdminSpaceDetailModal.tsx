import React, { useEffect, useState } from 'react';
import { Sensitive } from '../Sensitive.tsx';
import { createPortal } from 'react-dom';
import {
  X,
  MapPin,
  Users,
  Maximize2,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  CalendarCheck,
  Star,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Pencil,
} from 'lucide-react';
import {
  SII_THIRD_PARTY_URL,
  adminRejectTaxCertificate,
  adminReviewSpace,
  getTaxCertificateUrl,
  getTaxStatus,
  taxPending,
  taxStatusOk,
  taxValidUntil,
  type TaxStatus,
} from '../../lib/financeApi.ts';
import type { Reservation, Space } from '../../types.ts';
import { formatClp, formatRut } from '../../utils/formatters.ts';
import { getCategoryLabel } from '../../utils/spaceCategories.ts';

interface AdminSpaceDetailModalProps {
  space: Space;
  reservations: Reservation[];
  onClose: () => void;
  onToggleStatus: (spaceId: string, status: 'active' | 'paused') => void;
  /** Abre el formulario para corregir el espacio. */
  onEdit?: (space: Space) => void;
  /** Se aprobó o rechazó el espacio (hay que recargar la lista). */
  onReviewed?: () => void;
}

const STATUS_LABEL: Record<Space['status'], string> = {
  active: 'Activo',
  paused: 'Pausado',
  pending_approval: 'Pendiente de aprobación',
  deleted: 'Eliminado por el propietario',
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 min-w-0">
    <p className="text-xs font-bold tracking-wide text-slate-500">{label}</p>
    <div className="mt-0.5 text-sm font-semibold text-slate-800 break-words">{children}</div>
  </div>
);

/** Ficha completa de una publicación para revisión del administrador. */
export const AdminSpaceDetailModal: React.FC<AdminSpaceDetailModalProps> = ({
  space,
  reservations,
  onClose,
  onToggleStatus,
  onEdit,
  onReviewed,
}) => {
  const [photo, setPhoto] = useState(0);
  const isPending = space.status === 'pending_approval';
  // Situación tributaria del propietario: el admin ve su carpeta antes de aprobar.
  const [tax, setTax] = useState<TaxStatus | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectFile, setRejectFile] = useState(false);
  useEffect(() => {
    let alive = true;
    getTaxStatus(space.ownerId).then((t) => alive && setTax(t));
    return () => {
      alive = false;
    };
  }, [space.ownerId]);
  const carpetaPending = taxPending(tax);
  const openCertificate = async () => {
    if (!tax?.certificatePath) return;
    const url = await getTaxCertificateUrl(tax.certificatePath);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else setReviewError('No se pudo abrir la carpeta tributaria.');
  };
  const approve = async () => {
    setBusy(true);
    setReviewError(null);
    const r = await adminReviewSpace(space.id, true, undefined, carpetaPending ? true : undefined);
    setBusy(false);
    if (!r.success) return setReviewError(r.message || 'No se pudo aprobar.');
    onReviewed?.();
    onClose();
  };
  const reject = async () => {
    if (!rejectNote.trim()) return setReviewError('Escribe el motivo: el propietario lo verá.');
    setBusy(true);
    setReviewError(null);
    if (rejectFile && tax?.certificatePath) {
      const t = await adminRejectTaxCertificate(space.ownerId, rejectNote.trim());
      if (!t.success) {
        setBusy(false);
        return setReviewError(t.message || 'No se pudo rechazar la carpeta.');
      }
    }
    const r = await adminReviewSpace(space.id, false, rejectNote.trim());
    setBusy(false);
    if (!r.success) return setReviewError(r.message || 'No se pudo rechazar.');
    onReviewed?.();
    onClose();
  };
  const images = space.images?.length ? space.images : [];
  const spaceReservations = reservations.filter((r) => r.spaceId === space.id);
  const confirmed = spaceReservations.filter((r) => r.status === 'confirmed' || r.status === 'completed');

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const prices: { label: string; value?: number }[] = [
    { label: 'Por hora', value: space.pricePerHour },
    { label: 'Por día', value: space.pricePerDay },
    { label: 'Por mes', value: space.pricePerMonth },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de la publicación ${space.title}`}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl sm:rounded-3xl max-w-4xl w-full overflow-hidden shadow-2xl border border-slate-200 my-auto max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/40">
                Revisión de publicación
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  space.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-slate-300'
                }`}
              >
                {STATUS_LABEL[space.status] ?? space.status}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold mt-1 truncate">{space.title}</h2>
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3.5 h-3.5" />
              {[space.address, space.commune, space.region].filter(Boolean).join(', ')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Situación tributaria del propietario (Ley 21.713) */}
          <section aria-labelledby="sp-tax" className={`rounded-2xl border p-4 ${carpetaPending ? 'border-sky-200 bg-sky-50' : taxStatusOk(tax) ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 id="sp-tax" className="text-sm font-bold text-slate-900">Carpeta tributaria del propietario</h3>
                <p className="mt-0.5 text-xs text-slate-700">
                  {tax === undefined
                    ? 'Cargando…'
                    : !tax
                      ? 'No ha subido su carpeta tributaria.'
                      : carpetaPending
                        ? `Subida el ${new Date(tax.certificateUploadedAt!).toLocaleDateString('es-CL')}: falta revisarla. Al aprobar el espacio queda revisada como al día.`
                        : tax.reviewStatus === 'rejected'
                          ? `Rechazada: ${tax.reviewNote || ''}`
                          : taxStatusOk(tax)
                            ? `Al día · giro ${tax.activityCode || '—'} · vale hasta el ${taxValidUntil(tax).toLocaleDateString('es-CL')}`
                            : tax.hasActivity
                              ? 'Inicio de actividades con incumplimientos o carpeta vencida.'
                              : tax.exemptDeclared
                                ? 'Declaró no estar obligado a iniciar actividades (solo sin amoblar).'
                                : 'Sin inicio de actividades.'}
                </p>
                {space.isFurnished && (
                  <p className="mt-1 text-xs font-semibold text-slate-800">Espacio amoblado: necesita inicio de actividades al día para aprobarse.</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {tax?.certificatePath && (
                  <button type="button" onClick={openCertificate} className="inline-flex items-center gap-1 font-bold text-indigo-700 hover:underline cursor-pointer">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Ver carpeta tributaria
                  </button>
                )}
                <a href={SII_THIRD_PARTY_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-indigo-700 hover:underline">
                  Contrastar en el SII <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>
          </section>

          {/* Fotografías */}
          {images.length > 0 && (
            <div className="space-y-2">
              <div className="relative rounded-2xl overflow-hidden bg-slate-100 aspect-[16/8]">
                <img src={images[photo]} alt={`${space.title} — foto ${photo + 1}`} className="w-full h-full object-cover" />
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPhoto((p) => (p - 1 + images.length) % images.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/90 text-slate-800 shadow cursor-pointer"
                      aria-label="Foto anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhoto((p) => (p + 1) % images.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/90 text-slate-800 shadow cursor-pointer"
                      aria-label="Foto siguiente"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
                <span className="absolute bottom-3 right-3 text-xs font-bold bg-slate-900/80 text-white px-2 py-0.5 rounded-full">
                  Foto {photo + 1} de {images.length}
                </span>
              </div>
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {images.map((src, i) => (
                    <button
                      key={src + i}
                      type="button"
                      onClick={() => setPhoto(i)}
                      className={`w-20 h-14 rounded-lg overflow-hidden shrink-0 border-2 cursor-pointer ${
                        i === photo ? 'border-rose-500' : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Datos generales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Field label="Categoría">{getCategoryLabel(space.category)}</Field>
            <Field label="Entorno">{space.spaceEnvironment === 'abierto' ? 'Abierto' : 'Techado'}</Field>
            <Field label="Capacidad">
              <span className="inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-slate-500" /> {space.capacity} personas
              </span>
            </Field>
            <Field label="Superficie">
              <span className="inline-flex items-center gap-1">
                <Maximize2 className="w-3.5 h-3.5 text-slate-500" /> {space.surfaceM2} m²
              </span>
            </Field>
            <Field label="Horario">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" /> {space.openingHours || 'No informado'}
              </span>
            </Field>
            <Field label="Mínimo de reserva">
              {space.minBookingHours ? `${space.minBookingHours} h` : space.minBookingDays ? `${space.minBookingDays} días` : 'Sin mínimo'}
            </Field>
            <Field label="Reserva inmediata">{space.instantBooking ? 'Sí' : 'Requiere aprobación'}</Field>
            <Field label="Publicado el">
              {space.createdAt ? new Date(space.createdAt).toLocaleDateString('es-CL') : '—'}
            </Field>
          </div>

          {/* Tarifas */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2">Tarifas</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {prices.map((p) => (
                <Field key={p.label} label={p.label}>
                  {p.value ? formatClp(p.value) : <span className="text-slate-500 font-medium">No ofrece</span>}
                </Field>
              ))}
              <Field label="Garantía">
                {space.securityDeposit ? formatClp(space.securityDeposit) : <span className="text-slate-500 font-medium">No pide</span>}
              </Field>
            </div>
          </div>

          {/* Descripción, equipamiento y reglas */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1.5">Descripción</h3>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                {space.description || 'Sin descripción.'}
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1.5">Equipamiento</h3>
                <div className="flex flex-wrap gap-1.5">
                  {space.amenities?.length ? (
                    space.amenities.map((a) => (
                      <span key={a} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                        {a}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">Sin equipamiento informado.</span>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1.5">Reglas</h3>
                {space.rules?.length ? (
                  <ul className="list-disc list-inside text-sm text-slate-600 space-y-0.5">
                    {space.rules.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">Sin reglas informadas.</p>
                )}
              </div>
            </div>
          </div>

          {/* Propietario y actividad */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Propietario</h3>
              <p className="text-sm font-semibold text-slate-800">{space.ownerName}</p>
              <p className="text-xs text-slate-500">RUT {space.ownerRut ? <Sensitive kind="rut" value={space.ownerRut} /> : '—'}</p>
              <p
                className={`mt-2 inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                  space.ownerVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                {space.ownerVerified ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                {space.ownerVerified ? 'Identidad verificada' : 'Identidad sin verificar'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Actividad</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-slate-900">{spaceReservations.length}</p>
                  <p className="text-xs text-slate-500">Reservas</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-900">{confirmed.length}</p>
                  <p className="text-xs text-slate-500 inline-flex items-center gap-0.5">
                    <CalendarCheck className="w-3 h-3" /> Confirmadas
                  </p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-900">{space.reviewsCount ? space.rating.toFixed(1) : '—'}</p>
                  <p className="text-xs text-slate-500 inline-flex items-center gap-0.5">
                    <Star className="w-3 h-3" /> {space.reviewsCount} reseñas
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="border-t border-slate-100 px-5 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 shrink-0 bg-white">
          {space.status === 'active' ? (
            <a
              href={`/space/${space.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Ver página pública
            </a>
          ) : (
            <span className="text-xs text-slate-500">{isPending ? 'En revisión: no aparece en el catálogo hasta que la apruebes.' : 'La publicación no es visible en el catálogo mientras está pausada.'}</span>
          )}
          {isPending ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
                Cerrar
              </button>
              <button type="button" disabled={busy} onClick={() => setRejecting((v) => !v)} className="px-3.5 py-2 rounded-xl border border-rose-300 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 cursor-pointer">
                Rechazar
              </button>
              {onEdit && (
                <button type="button" disabled={busy} onClick={() => onEdit(space)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> Editar
                </button>
              )}
              <button type="button" disabled={busy} onClick={approve} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                {carpetaPending ? 'Aprobar espacio y carpeta' : 'Aprobar y publicar'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cerrar
              </button>
              {onEdit && (
                <button type="button" onClick={() => onEdit(space)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer">
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> Editar
                </button>
              )}
              <button
                type="button"
                onClick={() => onToggleStatus(space.id, space.status === 'active' ? 'paused' : 'active')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  space.status === 'active'
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {space.status === 'active' ? 'Pausar espacio' : 'Activar espacio'}
              </button>
            </div>
          )}
          {rejecting && isPending && (
            <div className="w-full space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
              <label htmlFor="sp-reject-note" className="block text-xs font-bold text-rose-900">
                Motivo del rechazo (el propietario lo verá)
              </label>
              <textarea
                id="sp-reject-note"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
                placeholder="Por ejemplo: las fotos no muestran el espacio"
              />
              {tax?.certificatePath && tax.reviewStatus === 'pending' && (
                <label className="flex items-center gap-2 text-xs text-rose-900 cursor-pointer">
                  <input type="checkbox" checked={rejectFile} onChange={(e) => setRejectFile(e.target.checked)} className="h-4 w-4 accent-rose-600" />
                  La carpeta tributaria tampoco sirve: rechazarla con el mismo motivo
                </label>
              )}
              <button type="button" disabled={busy} onClick={reject} className="px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50 cursor-pointer">
                Confirmar rechazo
              </button>
            </div>
          )}
          {reviewError && <p className="w-full text-xs font-semibold text-rose-700">{reviewError}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
};
