import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building,
  Camera,
  Check,
  Clock,
  Loader2,
  PlusCircle,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Space, SpaceCategory, SpaceEnvironment } from '../types.ts';
import { formatClp, getSpaceAvailableModalities } from '../utils/formatters.ts';
import { CATEGORY_GROUPS, SPACE_CATEGORIES, getCategoryInfo, normalizeCategory } from '../utils/spaceCategories.ts';
import { uploadSpaceImage } from '../lib/storage.ts';

export type SpaceFormData = Omit<
  Space,
  'id' | 'ownerId' | 'ownerName' | 'ownerRut' | 'ownerVerified' | 'rating' | 'reviewsCount' | 'createdAt'
>;

interface PublishSpaceFormProps {
  editingSpace: Space | null;
  onCancel: () => void;
  onSubmit: (data: SpaceFormData) => void;
}

const REGIONS = [
  'Región de Arica y Parinacota',
  'Región de Tarapacá',
  'Región de Antofagasta',
  'Región de Atacama',
  'Región de Coquimbo',
  'Región de Valparaíso',
  'Región Metropolitana',
  "Región del Libertador General Bernardo O'Higgins",
  'Región del Maule',
  'Región de Ñuble',
  'Región del Biobío',
  'Región de La Araucanía',
  'Región de Los Ríos',
  'Región de Los Lagos',
  'Región de Aysén',
  'Región de Magallanes',
];

const SUGGESTED_COMMUNES = [
  'Santiago Centro', 'Providencia', 'Las Condes', 'Vitacura', 'Lo Barnechea', 'Ñuñoa', 'La Reina',
  'Macul', 'Peñalolén', 'La Florida', 'Puente Alto', 'Maipú', 'San Miguel', 'Estación Central',
  'Independencia', 'Recoleta', 'Huechuraba', 'Colina', 'Lampa', 'Pirque', 'San José de Maipo',
  'Viña del Mar', 'Valparaíso', 'Concepción', 'La Serena', 'Pucón', 'Puerto Varas',
];

const AMENITIES = [
  'Wifi',
  'Estacionamiento',
  'Baño privado',
  'Cocina equipada',
  'Parrilla',
  'Piscina',
  'Aire acondicionado',
  'Calefacción',
  'Mesas y sillas',
  'Proyector o pantalla',
  'Acceso para silla de ruedas',
  'Seguridad 24/7',
];

const RULES = [
  'No se permite fumar',
  'Sin ruidos molestos después de las 22:00',
  'Entregar el espacio limpio',
  'Se aceptan mascotas',
  'Se permite comida y bebida',
  'Respetar la capacidad máxima',
];

const DAY_OPTIONS = [
  { value: 'Lun-Vie', label: 'Lunes a viernes' },
  { value: 'Lun-Sáb', label: 'Lunes a sábado' },
  { value: 'Lun-Dom', label: 'Todos los días' },
  { value: 'Sáb-Dom', label: 'Fines de semana' },
  { value: '24/7', label: 'Todo el día, todos los días' },
];

const HOURS = Array.from({ length: 18 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`).concat('24:00');

const MAX_IMAGES = 8;

const digits = (raw: string): number | '' => {
  const clean = raw.replace(/\D/g, '').replace(/^0+/, '');
  return clean === '' ? '' : parseInt(clean, 10);
};

// Reduce las fotos a un máximo de 1600 px para que la publicación cargue rápido.
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(String(reader.result));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function parseSchedule(raw?: string) {
  const text = raw || 'Lun-Vie 08:00-20:00';
  const match = text.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
  const days = DAY_OPTIONS.find((d) => text.includes(d.value))?.value || 'Lun-Vie';
  return { days, start: match ? match[1] : '08:00', end: match ? match[2] : '20:00' };
}

const inputClass =
  'w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden bg-white';
const labelClass = 'block text-xs font-bold text-slate-700 mb-1';

export const PublishSpaceForm: React.FC<PublishSpaceFormProps> = ({ editingSpace, onCancel, onSubmit }) => {
  const initial = editingSpace;
  const initialModalities = initial ? getSpaceAvailableModalities(initial) : ['por_hora', 'por_dia'];
  const schedule = parseSchedule(initial?.openingHours);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);

  // Paso 1: qué y dónde
  const [category, setCategory] = useState<SpaceCategory>(initial ? normalizeCategory(initial.category) : 'departamento');
  const [environment, setEnvironment] = useState<SpaceEnvironment>(initial?.spaceEnvironment || 'cerrado');
  const [title, setTitle] = useState(initial?.title || '');
  const [region, setRegion] = useState(initial?.region || 'Región Metropolitana');
  const [commune, setCommune] = useState(initial?.commune || '');
  const [address, setAddress] = useState(initial?.address || '');

  // Paso 2: precios y disponibilidad
  const [byHour, setByHour] = useState(initialModalities.includes('por_hora'));
  const [byDay, setByDay] = useState(initialModalities.includes('por_dia'));
  const [byMonth, setByMonth] = useState(initialModalities.includes('mensual'));
  const [hourPrice, setHourPrice] = useState<number | ''>(initial?.pricePerHour || '');
  const [minHours, setMinHours] = useState<number | ''>(initial?.minBookingHours || 1);
  const [dayPrice, setDayPrice] = useState<number | ''>(initial && initialModalities.includes('por_dia') ? initial.pricePerDay : '');
  const [monthPrice, setMonthPrice] = useState<number | ''>(initial?.pricePerMonth || '');
  const [requireDeposit, setRequireDeposit] = useState(Boolean(initial?.securityDeposit && initial.securityDeposit > 0));
  const [deposit, setDeposit] = useState<number | ''>(initial?.securityDeposit && initial.securityDeposit > 0 ? initial.securityDeposit : '');
  const [days, setDays] = useState(schedule.days);
  const [openAt, setOpenAt] = useState(schedule.start);
  const [closeAt, setCloseAt] = useState(schedule.end);
  const [instantBooking, setInstantBooking] = useState(initial?.instantBooking ?? true);

  // Paso 3: fotos y detalles
  const [images, setImages] = useState<string[]>(initial?.images || []);
  const [uploading, setUploading] = useState(false);
  const [capacity, setCapacity] = useState<number | ''>(initial?.capacity || '');
  const [surface, setSurface] = useState<number | ''>(initial?.surfaceM2 && initial.surfaceM2 > 1 ? initial.surfaceM2 : '');
  const [description, setDescription] = useState(initial?.description || '');
  const [amenities, setAmenities] = useState<string[]>(initial?.amenities || []);
  const [rules, setRules] = useState<string[]>(initial?.rules || []);
  const [showExtras, setShowExtras] = useState(Boolean(initial && ((initial.amenities?.length || 0) + (initial.rules?.length || 0) > 0)));

  const categoryInfo = getCategoryInfo(category);

  const scheduleText = days === '24/7' ? 'Lun-Dom 00:00-24:00 (24/7)' : `${days} ${openAt}-${closeAt}`;

  const toggle = (list: string[], value: string, setter: (v: string[]) => void) =>
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const handlePickCategory = (id: SpaceCategory) => {
    setCategory(id);
    setEnvironment(getCategoryInfo(id).environment);
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const room = MAX_IMAGES - images.length;
      const compressed = await Promise.all(files.slice(0, room).map(compressImage));
      // Se suben a Storage para no guardar imágenes pesadas dentro de la base de datos.
      const uploaded = await Promise.all(compressed.map((dataUrl) => uploadSpaceImage(dataUrl, 'fotos')));
      setImages((prev) => [...prev, ...uploaded]);
      if (files.length > room) setError(`Puedes subir hasta ${MAX_IMAGES} fotos.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la imagen.');
    } finally {
      setUploading(false);
    }
  };

  const validateStep = (target: 1 | 2 | 3): string | null => {
    if (target >= 1) {
      if (title.trim().length < 5) return 'Escribe un título de al menos 5 caracteres.';
      if (!commune.trim()) return 'Indica la comuna.';
      if (address.trim().length < 5) return 'Indica la dirección del espacio.';
    }
    if (target >= 2) {
      if (!byHour && !byDay && !byMonth) return 'Elige al menos una forma de arriendo (por hora, por día o por mes).';
      if (byHour && !hourPrice) return 'Indica el precio por hora.';
      if (byDay && !dayPrice) return 'Indica el precio por día.';
      if (byMonth && !monthPrice) return 'Indica el precio por mes.';
      if (byMonth && requireDeposit && !deposit) return 'Indica el monto de la garantía o marca que no la pides.';
      if (days !== '24/7' && openAt >= closeAt) return 'La hora de cierre debe ser posterior a la de apertura.';
    }
    if (target >= 3) {
      if (images.length === 0) return 'Sube al menos una foto del espacio.';
      if (!capacity) return 'Indica para cuántas personas es el espacio.';
      if (!surface) return 'Indica la superficie aproximada en m².';
    }
    return null;
  };

  const goNext = () => {
    const problem = validateStep(step);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateStep(3);
    if (problem) {
      setError(problem);
      return;
    }

    const enabledModalities = [
      ...(byHour ? (['por_hora'] as const) : []),
      ...(byDay ? (['por_dia'] as const) : []),
      ...(byMonth ? (['mensual'] as const) : []),
    ];
    const rentalModality =
      enabledModalities.length > 1 ? 'abierto' : enabledModalities[0] === 'por_hora' ? 'por_hora' : enabledModalities[0] === 'mensual' ? 'mensual' : 'por_dia';
    const priceUnit = rentalModality === 'por_hora' ? 'hour' : rentalModality === 'mensual' ? 'month' : 'day';
    // La base exige un precio diario; si no se arrienda por día se deriva como referencia.
    const pricePerDay = byDay
      ? Number(dayPrice)
      : byHour
      ? Number(hourPrice) * 8
      : Math.round(Number(monthPrice) / 30);

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      category,
      spaceEnvironment: environment,
      rentalModality,
      enabledModalities: [...enabledModalities],
      priceUnit,
      commune: commune.trim(),
      region,
      address: address.trim(),
      pricePerDay,
      pricePerHour: byHour ? Number(hourPrice) : undefined,
      pricePerMonth: byMonth ? Number(monthPrice) : undefined,
      capacity: Number(capacity),
      surfaceM2: Number(surface),
      amenities,
      rules,
      openingHours: scheduleText,
      securityDeposit: byMonth && requireDeposit ? Number(deposit) : 0,
      images,
      isVerified: editingSpace?.isVerified ?? false,
      status: editingSpace?.status ?? 'pending_approval',
      minBookingDays: 1,
      minBookingHours: byHour ? Math.max(1, Number(minHours) || 1) : 1,
      instantBooking,
    });
  };

  const stepTitles = ['Tu espacio', 'Precio y horario', 'Fotos y detalles'];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
      {/* Indicador de pasos */}
      <div className="px-5 sm:px-6 pt-4 pb-3 border-b border-slate-100 bg-white shrink-0">
        <ol className="flex items-center gap-2">
          {stepTitles.map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3;
            const done = step > n;
            const active = step === n;
            return (
              <li key={label} className="flex items-center gap-2 flex-1 min-w-0">
                <span
                  className={`w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center shrink-0 ${
                    done ? 'bg-emerald-600 text-white' : active ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {done ? <Check className="w-3.5 h-3.5" /> : n}
                </span>
                <span className={`text-xs font-bold truncate ${active ? 'text-slate-900' : 'text-slate-500 hidden sm:inline'}`}>{label}</span>
                {i < 2 && <span className="hidden sm:block flex-1 h-px bg-slate-200" />}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
        {step === 1 && (
          <>
            <div>
              <p className={labelClass}>¿Qué tipo de espacio vas a arrendar?</p>
              <div className="space-y-3">
                {CATEGORY_GROUPS.map((group) => {
                  const items = SPACE_CATEGORIES.filter((c) => c.group === group.id);
                  return (
                    <div key={group.id}>
                      <p className="text-[11px] font-semibold text-slate-500 mb-1.5">{group.label}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {items.map((c) => {
                          const Icon = c.icon;
                          const selected = category === c.id;
                          return (
                            <button
                              type="button"
                              key={c.id}
                              onClick={() => handlePickCategory(c.id)}
                              aria-pressed={selected}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-xs font-semibold transition cursor-pointer ${
                                selected
                                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                              }`}
                            >
                              <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-rose-400' : 'text-slate-500'}`} />
                              <span className="leading-tight">{c.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">Ejemplo: {categoryInfo.hint.toLowerCase()}.</p>
            </div>

            <div>
              <label htmlFor="ps-title" className={labelClass}>
                Título de la publicación
              </label>
              <input
                id="ps-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Ej: ${categoryInfo.label} con terraza en ${commune || 'Ñuñoa'}`}
                className={inputClass}
                maxLength={90}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="ps-region" className={labelClass}>
                  Región
                </label>
                <select id="ps-region" value={region} onChange={(e) => setRegion(e.target.value)} className={inputClass}>
                  {REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ps-commune" className={labelClass}>
                  Comuna
                </label>
                <input
                  id="ps-commune"
                  list="ps-communes"
                  value={commune}
                  onChange={(e) => setCommune(e.target.value)}
                  placeholder="Ej: Ñuñoa"
                  className={inputClass}
                />
                <datalist id="ps-communes">
                  {SUGGESTED_COMMUNES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label htmlFor="ps-address" className={labelClass}>
                Dirección
              </label>
              <input
                id="ps-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ej: Av. Irarrázaval 1234, depto 501"
                className={inputClass}
              />
              <p className="text-[11px] text-slate-500 mt-1">Solo la verán quienes reserven o agenden una visita.</p>
            </div>

            <div>
              <p className={labelClass}>¿Es techado o al aire libre?</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'cerrado', label: 'Techado', icon: Building },
                  { id: 'abierto', label: 'Al aire libre', icon: Sun },
                ] as const).map((opt) => {
                  const Icon = opt.icon;
                  const selected = environment === opt.id;
                  return (
                    <button
                      type="button"
                      key={opt.id}
                      onClick={() => setEnvironment(opt.id)}
                      aria-pressed={selected}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        selected ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-2.5">
              <p className={labelClass}>¿Cómo quieres arrendarlo? Puedes elegir más de una opción.</p>

              <ModalityRow
                label="Por hora"
                enabled={byHour}
                onToggle={setByHour}
                price={hourPrice}
                onPrice={setHourPrice}
                unit="hora"
              >
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span>Mínimo</span>
                  <select
                    value={minHours || 1}
                    onChange={(e) => setMinHours(Number(e.target.value))}
                    className="px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
                  >
                    {[1, 2, 3, 4, 6, 8].map((h) => (
                      <option key={h} value={h}>
                        {h} {h === 1 ? 'hora' : 'horas'}
                      </option>
                    ))}
                  </select>
                  <span>por reserva</span>
                </div>
              </ModalityRow>

              <ModalityRow label="Por día" enabled={byDay} onToggle={setByDay} price={dayPrice} onPrice={setDayPrice} unit="día" />

              <ModalityRow label="Por mes" enabled={byMonth} onToggle={setByMonth} price={monthPrice} onPrice={setMonthPrice} unit="mes">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    ¿Pides garantía para arriendos mensuales?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRequireDeposit(false)}
                      aria-pressed={!requireDeposit}
                      className={`py-2 rounded-lg border text-xs font-bold cursor-pointer ${
                        !requireDeposit ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      No, sin garantía
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRequireDeposit(true);
                        if (!deposit && monthPrice) setDeposit(monthPrice);
                      }}
                      aria-pressed={requireDeposit}
                      className={`py-2 rounded-lg border text-xs font-bold cursor-pointer ${
                        requireDeposit ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      Sí, pido garantía
                    </button>
                  </div>
                  {requireDeposit && (
                    <div className="space-y-1">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">$</span>
                        <input
                          inputMode="numeric"
                          aria-label="Monto de la garantía"
                          value={deposit}
                          onChange={(e) => setDeposit(digits(e.target.value))}
                          placeholder="Ej: 350000"
                          className={`${inputClass} pl-7`}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Se cobra una sola vez al inicio y se devuelve al terminar el arriendo.
                        {monthPrice ? ` Lo habitual es un mes (${formatClp(Number(monthPrice))}).` : ''}
                      </p>
                    </div>
                  )}
                </div>
              </ModalityRow>
              <p className="text-[11px] text-slate-500">
                Spotly cobra al arrendatario una comisión de servicio de 5 % sobre el arriendo. Los arriendos por hora y por día no llevan garantía.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
              <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-rose-600" /> Horario disponible
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select value={days} onChange={(e) => setDays(e.target.value)} aria-label="Días disponibles" className={inputClass}>
                  {DAY_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <select
                  value={openAt}
                  onChange={(e) => setOpenAt(e.target.value)}
                  disabled={days === '24/7'}
                  aria-label="Hora de apertura"
                  className={`${inputClass} disabled:opacity-50`}
                >
                  {HOURS.slice(0, -1).map((h) => (
                    <option key={h} value={h}>
                      Desde {h}
                    </option>
                  ))}
                </select>
                <select
                  value={closeAt}
                  onChange={(e) => setCloseAt(e.target.value)}
                  disabled={days === '24/7'}
                  aria-label="Hora de cierre"
                  className={`${inputClass} disabled:opacity-50`}
                >
                  {HOURS.slice(1).map((h) => (
                    <option key={h} value={h}>
                      Hasta {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={instantBooking}
                onChange={(e) => setInstantBooking(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-rose-600"
              />
              <span>
                <span className="block text-xs font-bold text-slate-900">Reserva inmediata</span>
                <span className="block text-[11px] text-slate-500">
                  La reserva se confirma sola al aprobarse el pago. Si la desmarcas, tendrás que aceptar cada solicitud.
                </span>
              </span>
            </label>
          </>
        )}

        {step === 3 && (
          <>
            <div className="space-y-2.5">
              <p className={`${labelClass} flex items-center gap-1.5`}>
                <Camera className="w-4 h-4 text-rose-600" /> Fotos ({images.length}/{MAX_IMAGES})
              </p>
              <label
                className={`flex items-center justify-center gap-2 p-4 bg-white border-2 border-dashed rounded-xl text-sm font-semibold transition ${
                  images.length >= MAX_IMAGES
                    ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                    : 'border-slate-300 hover:border-rose-500 text-slate-700 hover:text-rose-600 cursor-pointer'
                }`}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>{uploading ? 'Procesando fotos…' : 'Subir fotos desde tu equipo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFiles}
                  disabled={uploading || images.length >= MAX_IMAGES}
                  className="hidden"
                />
              </label>
              {images.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {images.map((src, idx) => (
                    <div key={idx} className="relative rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                      <img src={src} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                      {idx === 0 && (
                        <span className="absolute top-1 left-1 bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">Portada</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 bg-black/70 hover:bg-rose-600 text-white p-1 rounded-md cursor-pointer"
                        aria-label={`Quitar foto ${idx + 1}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ps-capacity" className={labelClass}>
                  Capacidad (personas)
                </label>
                <input
                  id="ps-capacity"
                  inputMode="numeric"
                  value={capacity}
                  onChange={(e) => setCapacity(digits(e.target.value))}
                  placeholder="Ej: 10"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="ps-surface" className={labelClass}>
                  Superficie aproximada (m²)
                </label>
                <input
                  id="ps-surface"
                  inputMode="numeric"
                  value={surface}
                  onChange={(e) => setSurface(digits(e.target.value))}
                  placeholder="Ej: 60"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="ps-description" className={labelClass}>
                Descripción <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <textarea
                id="ps-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Cuenta qué hace especial a tu espacio y qué incluye."
                className={inputClass}
              />
            </div>

            <div className="rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setShowExtras((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-slate-800 cursor-pointer"
                aria-expanded={showExtras}
              >
                <span>
                  Comodidades y reglas <span className="font-normal text-slate-400">(opcional)</span>
                </span>
                <span className="text-slate-400">{showExtras ? 'Ocultar' : 'Agregar'}</span>
              </button>
              {showExtras && (
                <div className="px-4 pb-4 space-y-3">
                  <ChipGroup items={AMENITIES} selected={amenities} onToggle={(v) => toggle(amenities, v, setAmenities)} />
                  <p className="text-[11px] font-semibold text-slate-500">Reglas</p>
                  <ChipGroup items={RULES} selected={rules} onToggle={(v) => toggle(rules, v, setRules)} />
                </div>
              )}
            </div>
          </>
        )}

        {error && (
          <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
            {error}
          </div>
        )}
      </div>

      <div className="px-5 sm:px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0 bg-white">
        <button
          type="button"
          onClick={() => {
            setError(null);
            if (step === 1) onCancel();
            else setStep((s) => (s - 1) as 1 | 2 | 3);
          }}
          className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
        >
          {step === 1 ? 'Cancelar' : (
            <>
              <ArrowLeft className="w-4 h-4" /> Atrás
            </>
          )}
        </button>
        {step < 3 ? (
          <button
            key="siguiente"
            type="button"
            onClick={goNext}
            className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            Continuar <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          // key distinta: evita que el clic en "Continuar" envíe el formulario al llegar al último paso.
          <button
            key="publicar"
            type="submit"
            disabled={uploading}
            className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            {editingSpace ? <Check className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
            {editingSpace ? 'Guardar cambios' : 'Publicar espacio'}
          </button>
        )}
      </div>
    </form>
  );
};

const ModalityRow: React.FC<{
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  price: number | '';
  onPrice: (v: number | '') => void;
  unit: string;
  children?: React.ReactNode;
}> = ({ label, enabled, onToggle, price, onPrice, unit, children }) => (
  <div className={`rounded-2xl border transition ${enabled ? 'border-slate-900 bg-white' : 'border-slate-200 bg-slate-50'}`}>
    <div className="flex items-center gap-3 p-3">
      <label className="flex items-center gap-2 cursor-pointer min-w-[100px]">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="w-4 h-4 accent-rose-600" />
        <span className="text-sm font-bold text-slate-900">{label}</span>
      </label>
      {enabled && (
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">$</span>
          <input
            inputMode="numeric"
            aria-label={`Precio ${label.toLowerCase()}`}
            value={price}
            onChange={(e) => onPrice(digits(e.target.value))}
            placeholder="Precio"
            className="w-full pl-7 pr-16 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">/ {unit}</span>
        </div>
      )}
    </div>
    {enabled && children && <div className="px-3 pb-3">{children}</div>}
  </div>
);

const ChipGroup: React.FC<{ items: string[]; selected: string[]; onToggle: (v: string) => void }> = ({ items, selected, onToggle }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((item) => {
      const on = selected.includes(item);
      return (
        <button
          type="button"
          key={item}
          onClick={() => onToggle(item)}
          aria-pressed={on}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
            on ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          {on ? <Check className="w-3.5 h-3.5" /> : <PlusCircle className="w-3.5 h-3.5 text-slate-400" />}
          {item}
        </button>
      );
    })}
  </div>
);
