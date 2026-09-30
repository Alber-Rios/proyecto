import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { formatClp, formatRut } from '../utils/formatters.ts';
import {
  Scale,
  AlertCircle,
  CheckCircle2,
  Building2,
  Send,
  Clock,
  ShieldCheck,
  MessageSquareWarning,
  FileText,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';

interface SupportPageProps {
  onNavigate: (view: string) => void;
  onOpenAuth?: (mode: 'login' | 'register', notice?: string) => void;
}

const PROBLEM_CATEGORIES = [
  'Condiciones del lugar distintas a lo publicado',
  'Fallas en equipamiento, internet o servicios básicos',
  'Problemas de acceso o incumplimiento del anfitrión',
  'Higiene, seguridad o infraestructura del lugar',
  'Devolución de garantía o cobros del arriendo',
  'Otro problema con el lugar',
];

export const SupportPage: React.FC<SupportPageProps> = ({ onNavigate, onOpenAuth }) => {
  const { currentUser, reservations, disputes, createDispute } = useApp();

  // Reservas del usuario actual (solo lugares que reservó)
  const myReservations = useMemo(() => {
    if (!currentUser) return [];
    return reservations.filter(
      (r) =>
        r.tenantId === currentUser.id ||
        r.tenantRut.replace(/\D/g, '') === currentUser.rut.replace(/\D/g, '')
    );
  }, [reservations, currentUser]);

  const [selectedReservationId, setSelectedReservationId] = useState<string>(
    () => myReservations[0]?.id || ''
  );
  const [problemCategory, setProblemCategory] = useState<string>(PROBLEM_CATEGORIES[0]);
  const [problemComment, setProblemComment] = useState<string>('');
  const [submittedDisputeId, setSubmittedDisputeId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Disputas del usuario actual
  const myDisputes = useMemo(() => {
    if (!currentUser) return [];
    return disputes.filter(
      (d) =>
        d.tenantId === currentUser.id ||
        d.tenantRut.replace(/\D/g, '') === currentUser.rut.replace(/\D/g, '') ||
        d.ownerRut.replace(/\D/g, '') === currentUser.rut.replace(/\D/g, '')
    );
  }, [disputes, currentUser]);

  if (!currentUser) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-lg space-y-6">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto shadow-xs">
            <HelpCircle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
              Centro de Ayuda y Soporte
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Inicia sesión para reportar un problema o abrir una disputa
            </h2>
            <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              En el Centro de Ayuda y Soporte puedes comentar cualquier problema con un lugar reservado para que quede registrado como disputa formal ante el Administrador.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() =>
                onOpenAuth?.('login', 'Inicia sesión para reportar un problema en Ayuda y Soporte.')
              }
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md transition cursor-pointer"
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() =>
                onOpenAuth?.('register', 'Crea tu cuenta para acceder a Ayuda y Soporte.')
              }
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition cursor-pointer"
            >
              Crear Cuenta Gratis
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmitProblem = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmittedDisputeId(null);

    if (myReservations.length === 0) {
      setFormError('Debes tener una reserva realizada en el lugar para poder reportar un problema.');
      return;
    }

    const targetId = selectedReservationId || myReservations[0]?.id;

    if (!targetId) {
      setFormError('Selecciona el lugar reservado sobre el cual deseas reportar el problema.');
      return;
    }

    if (!problemComment.trim()) {
      setFormError('Por favor comenta detalladamente el problema que tuviste con el lugar.');
      return;
    }

    const created = createDispute(targetId, problemComment.trim(), {
      problemCategory,
    });

    if (created) {
      setSubmittedDisputeId(created.id);
      setProblemComment('');
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-4 space-y-6 pb-20">
      {/* Encabezado Principal */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
            <Scale className="w-3.5 h-3.5 text-rose-600" />
            Ayuda, Soporte y Centro de Disputas
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            ¿Tuviste un problema con el lugar?
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl">
            Comenta aquí cualquier inconveniente ocurrido en el espacio arrendado. Tu reporte quedará registrado automáticamente como una <strong>Disputa Oficial</strong> para que el Administrador revise el caso y gestione la garantía o reembolso.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onNavigate('my-bookings')}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            Ver Mis Reservas
          </button>
        </div>
      </div>

      {/* Si el usuario tiene su solicitud de verificación rechazada, informarle también aquí */}
      {currentUser.verificationStatus === 'rejected' && (
        <div className="bg-rose-50 border-2 border-rose-200 rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-rose-900">
                Aviso Importante · Solicitud de Verificación Rechazada
              </span>
              <p className="text-xs text-rose-800">
                <strong>Motivo informado por el Administrador:</strong> "
                {currentUser.kycRejectionReason ||
                  currentUser.kycData?.rejectionReason ||
                  'La documentación enviada presenta observaciones o no es legible.'}
                "
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('onboarding')}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer transition flex items-center gap-1.5"
          >
            <span>Corregir Verificación</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUMNA IZQUIERDA (6 cols): FORMULARIO PARA COMENTAR PROBLEMAS DEL LUGAR -> DISPUTA */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-5">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <MessageSquareWarning className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Reportar Problema del Lugar (Abrir Disputa)
              </h2>
              <p className="text-xs text-slate-500">
                Completa los datos para registrar tu reclamo en el sistema de arbitraje.
              </p>
            </div>
          </div>

          {submittedDisputeId && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>¡Tu problema fue registrado como Disputa #{submittedDisputeId}!</span>
              </div>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                El Administrador ya recibió tu comentario sobre el lugar en el Centro de Arbitraje y Garantías. Puedes ver el estado de tu disputa en el panel derecho.
              </p>
            </div>
          )}

          {formError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmitProblem} className="space-y-4">
            {/* Selector exclusivo de lugares reservados por el usuario */}
            {myReservations.length > 0 ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Selecciona el lugar de tu reserva
                </label>
                <select
                  value={selectedReservationId || myReservations[0]?.id || ''}
                  onChange={(e) => setSelectedReservationId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                >
                  {myReservations.map((res) => (
                    <option key={res.id} value={res.id}>
                      {res.spaceTitle} — Reserva #{res.id.slice(-6)} ({res.startDate}) · {formatClp(res.totalClp)}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  Solo aparecen los lugares donde has realizado una reserva.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>No tienes lugares reservados actualmente</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Para reportar un problema y abrir una disputa, primero debes haber realizado una reserva en ese lugar.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('home')}
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition cursor-pointer inline-flex items-center gap-1.5"
                >
                  <span>Explorar Lugares</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Motivo / Categoría del problema */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Tipo de problema en el lugar
              </label>
              <select
                value={problemCategory}
                onChange={(e) => setProblemCategory(e.target.value)}
                disabled={myReservations.length === 0}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-rose-500 focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-400"
              >
                {PROBLEM_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Comentario detallado del problema */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Comenta el problema que tuviste con el lugar
              </label>
              <textarea
                rows={4}
                required
                disabled={myReservations.length === 0}
                value={problemComment}
                onChange={(e) => setProblemComment(e.target.value)}
                placeholder="Describe qué ocurrió en el lugar (ej. el espacio no contaba con el equipamiento prometido, hubo problemas de acceso, limpieza o desperfectos)..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500 focus:outline-hidden bg-white resize-y disabled:bg-slate-100 disabled:text-slate-400"
              />
              <p className="text-[11px] text-slate-500">
                Al enviar este comentario, se generará una <strong>Disputa</strong> que será revisada por el Administrador.
              </p>
            </div>

            <button
              type="submit"
              disabled={myReservations.length === 0}
              className={`w-full py-3.5 rounded-2xl font-bold text-xs shadow-md transition flex items-center justify-center gap-2 ${
                myReservations.length === 0
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>Enviar Comentario y Registrar como Disputa</span>
            </button>
          </form>
        </div>

        {/* COLUMNA DERECHA (6 cols): HISTORIAL DE MIS DISPUTAS Y RESPUESTAS DEL ADMIN */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Mis Disputas y Estado de Reclamos ({myDisputes.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Seguimiento de los problemas reportados y dictamen de Administración.
                </p>
              </div>
            </div>
          </div>

          {myDisputes.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3 bg-slate-50/70 rounded-2xl border border-slate-100">
              <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800">
                  No tienes disputas registradas
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Si tuviste algún inconveniente con un lugar reservado, coméntalo en el formulario para abrir una disputa.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-h-[560px] overflow-y-auto pr-1">
              {myDisputes.map((d) => {
                const isResolved =
                  d.status === 'resolved_refund' || d.status === 'resolved_owner';
                return (
                  <div
                    key={d.id}
                    className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                          #{d.id}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            d.status === 'resolved_refund'
                              ? 'bg-emerald-100 text-emerald-800'
                              : d.status === 'resolved_owner'
                              ? 'bg-slate-200 text-slate-800'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {d.status === 'resolved_refund'
                            ? '✓ Resuelta · Reembolso al Usuario'
                            : d.status === 'resolved_owner'
                            ? 'Resuelta · Garantía Liberada al Propietario'
                            : '⏳ En Revisión / Arbitraje'}
                        </span>
                      </div>
                      <span className="text-xs font-extrabold text-rose-600">
                        Monto involucrado: {formatClp(d.amountClp)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <h3 className="text-sm font-bold text-slate-900">{d.spaceTitle}</h3>
                    </div>

                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Problema comentado por el usuario:
                      </span>
                      <p className="text-slate-800 font-medium leading-relaxed">{d.reason}</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>
                        Anfitrión: <strong className="text-slate-700">{d.ownerName}</strong> ({formatRut(d.ownerRut)})
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(d.createdAt).toLocaleDateString('es-CL')}
                      </span>
                    </div>

                    {isResolved && d.resolutionNotes && (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950">
                        <strong>Dictamen del Administrador:</strong> {d.resolutionNotes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
