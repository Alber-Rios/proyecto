import React, { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import { getTaxStatus, taxCanPublish, taxReviewDue, taxStatusOk, type TaxStatus } from '../lib/financeApi.ts';

// Aviso en el panel del propietario cuando falta algo tributario (Ley 21.713):
// no ha subido su carpeta tributaria, venció (se pide cada 90 días) o tiene
// espacios amoblados sin cumplimiento al día (se retiene anticipo de IVA).
export const TaxReviewNotice: React.FC<{ userId: string; furnishedCount: number; spacesCount: number; onOpen: () => void }> = ({
  userId,
  furnishedCount,
  spacesCount,
  onOpen,
}) => {
  const [tax, setTax] = useState<TaxStatus | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    getTaxStatus(userId).then((t) => alive && setTax(t));
    return () => {
      alive = false;
    };
  }, [userId]);

  if (tax === undefined || spacesCount === 0) return null;
  // Ya subió su carpeta: falta que un administrador la revise, no hay nada que hacer.
  if (tax?.reviewStatus === 'pending') return null;
  let text: string | null = null;
  if (!tax) text = 'Sube tu carpeta tributaria del SII: por ley, Spotly debe verificar tu inicio de actividades.';
  else if (tax.reviewStatus === 'rejected') text = `Rechazamos tu carpeta tributaria${tax.reviewNote ? ` (${tax.reviewNote})` : ''}. Súbela de nuevo.`;
  else if (furnishedCount > 0 && !taxStatusOk(tax))
    text = taxReviewDue(tax)
      ? 'Tu carpeta tributaria venció (se pide cada 90 días): sube una actualizada. Mientras tanto, de tus arriendos amoblados se retiene un anticipo de IVA.'
      : 'No acreditas cumplimiento tributario: de tus arriendos amoblados se retiene un anticipo de IVA.';
  else if (!taxCanPublish(tax)) text = 'Sube tu carpeta tributaria para seguir publicando espacios.';
  else if (tax.hasActivity && taxReviewDue(tax)) text = 'Tu carpeta tributaria venció (se pide cada 90 días): sube una actualizada.';
  if (!text) return null;

  return (
    <div role="status" className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <p className="text-sm text-amber-950">{text}</p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="min-h-10 shrink-0 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 cursor-pointer"
      >
        Revisar impuestos
      </button>
    </div>
  );
};
