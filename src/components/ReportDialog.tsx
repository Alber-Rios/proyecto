import React, { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { Flag, Loader2, X } from 'lucide-react';

const CATEGORIES = [
  'Información falsa o engañosa',
  'Fotos que no corresponden al espacio',
  'Precio o cobros abusivos',
  'Posible fraude o suplantación',
  'Contenido inapropiado',
  'Otro motivo',
];

interface ReportDialogProps {
  targetType: 'space' | 'user';
  targetSpaceId?: string;
  targetUserId?: string;
  targetLabel: string;
  buttonLabel?: string;
}

// Reporte de publicaciones o usuarios para revisión de administración (RF-32).
export const ReportDialog: React.FC<ReportDialogProps> = ({
  targetType,
  targetSpaceId,
  targetUserId,
  targetLabel,
  buttonLabel = 'Reportar publicación',
}) => {
  const { currentUser, submitReport } = useApp();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!currentUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 10) {
      setError('Describe el problema con al menos 10 caracteres.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await submitReport({ targetType, targetSpaceId, targetUserId, targetLabel, category, description: description.trim() });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el reporte.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setSent(false);
        }}
        className="text-[11px] font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
      >
        <Flag className="w-3.5 h-3.5" /> {buttonLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between">
              <h3 className="text-base font-black text-slate-900">Reportar “{targetLabel}”</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="cursor-pointer">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            {sent ? (
              <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                Gracias. El equipo de administración revisará el reporte y te notificará el resultado.
              </p>
            ) : (
              <>
                <label className="block text-xs font-bold text-slate-900">
                  Motivo
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-900">
                  Detalle
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium"
                    placeholder="Explica qué ocurrió"
                  />
                </label>
                {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={sending}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enviar reporte
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
};
