import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import type { Reservation, Space } from '../../types.ts';
import { formatClp, formatRut } from '../../utils/formatters.ts';
import { getCategoryLabel } from '../../utils/spaceCategories.ts';

interface AdminSpaceDetailModalProps {
  space: Space;
  reservations: Reservation[];
  onClose: () => void;
  onToggleStatus: (spaceId: string, status: 'active' | 'paused') => void;
}

const STATUS_LABEL: Record<Space['status'], string> = {
  active: 'Activo',
  paused: 'Pausado',
  pending_approval: 'Pendiente de aprobación',
  deleted: 'Eliminado por el propietario',
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 min-w-0">
    <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    <div className="mt-0.5 text-sm font-semibold text-slate-800 break-words">{children}</div>
  </div>
);

/** Ficha completa de una publicación para revisión del administrador. */
export const AdminSpaceDetailModal: React.FC<AdminSpaceDetailModalProps> = ({
  space,
  reservations,
  onClose,
  onToggleStatus,
}) => {
  const [photo, setPhoto] = useState(0);
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
              <span className="text-[11.5px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-200 border border-brand-400/40">
                Revisión de publicación
              </span>
              <span
                className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full ${
                  space.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-slate-300'
                }`}
              >
                {STATUS_LABEL[space.status] ?? space.status}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-semibold mt-1 truncate">{space.title}</h2>
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
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
                <span className="absolute bottom-3 right-3 text-[12.5px] font-semibold bg-slate-900/80 text-white px-2 py-0.5 rounded-full">
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
                        i === photo ? 'border-brand-500' : 'border-transparent opacity-70 hover:opacity-100'
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
                <Users className="w-3.5 h-3.5 text-slate-400" /> {space.capacity} personas
              </span>
            </Field>
            <Field label="Superficie">
              <span className="inline-flex items-center gap-1">
                <Maximize2 className="w-3.5 h-3.5 text-slate-400" /> {space.surfaceM2} m²
              </span>
            </Field>
            <Field label="Horario">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> {space.openingHours || 'No informado'}
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
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Tarifas</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {prices.map((p) => (
                <Field key={p.label} label={p.label}>
                  {p.value ? formatClp(p.value) : <span className="text-slate-400 font-medium">No ofrece</span>}
                </Field>
              ))}
              <Field label="Garantía">
                {space.securityDeposit ? formatClp(space.securityDeposit) : <span className="text-slate-400 font-medium">No pide</span>}
              </Field>
            </div>
          </div>

          {/* Descripción, equipamiento y reglas */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Descripción</h3>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                {space.description || 'Sin descripción.'}
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Equipamiento</h3>
                <div className="flex flex-wrap gap-1.5">
                  {space.amenities?.length ? (
                    space.amenities.map((a) => (
                      <span key={a} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                        {a}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">Sin equipamiento informado.</span>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Reglas</h3>
                {space.rules?.length ? (
                  <ul className="list-disc list-inside text-sm text-slate-600 space-y-0.5">
                    {space.rules.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400">Sin reglas informadas.</p>
                )}
              </div>
            </div>
          </div>

          {/* Propietario y actividad */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Propietario</h3>
              <p className="text-sm font-semibold text-slate-800">{space.ownerName}</p>
              <p className="text-xs text-slate-500">RUT {space.ownerRut ? formatRut(space.ownerRut) : '—'}</p>
              <p
                className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  space.ownerVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                {space.ownerVerified ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                {space.ownerVerified ? 'Identidad verificada' : 'Identidad sin verificar'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Actividad</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{spaceReservations.length}</p>
                  <p className="text-[12.5px] text-slate-500">Reservas</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900">{confirmed.length}</p>
                  <p className="text-[12.5px] text-slate-500 inline-flex items-center gap-0.5">
                    <CalendarCheck className="w-3 h-3" /> Confirmadas
                  </p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900">{space.reviewsCount ? space.rating.toFixed(1) : '—'}</p>
                  <p className="text-[12.5px] text-slate-500 inline-flex items-center gap-0.5">
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Ver página pública
            </a>
          ) : (
            <span className="text-xs text-slate-400">La publicación no es visible en el catálogo mientras está pausada.</span>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => onToggleStatus(space.id, space.status === 'active' ? 'paused' : 'active')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                space.status === 'active'
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {space.status === 'active' ? 'Pausar espacio' : 'Activar espacio'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
