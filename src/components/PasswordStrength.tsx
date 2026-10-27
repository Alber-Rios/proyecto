import React from 'react';
import { Check, X } from 'lucide-react';
import { checkPassword, passwordScore } from '../utils/passwordPolicy.ts';

const LEVELS = [
  { label: 'Muy débil', color: 'bg-rose-500', text: 'text-rose-700' },
  { label: 'Débil', color: 'bg-rose-500', text: 'text-rose-700' },
  { label: 'Aceptable', color: 'bg-amber-500', text: 'text-amber-700' },
  { label: 'Buena', color: 'bg-emerald-500', text: 'text-emerald-700' },
  { label: 'Muy segura', color: 'bg-emerald-600', text: 'text-emerald-700' },
];

/** Barra de seguridad y lista de requisitos de la contraseña. */
export const PasswordStrength: React.FC<{
  password: string;
  personal?: Parameters<typeof checkPassword>[1];
  id?: string;
}> = ({ password, personal, id }) => {
  const checks = checkPassword(password, personal);
  const score = passwordScore(password, personal);
  const level = LEVELS[score];
  return (
    <div id={id} className="mt-2 space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${password && i < Math.max(score, 1) ? level.color : 'bg-stone-200'}`} />
          ))}
        </div>
        {password && <span className={`text-[11px] font-bold ${level.text}`}>{level.label}</span>}
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
        {checks.map((c) => (
          <li key={c.id} className={`flex items-center gap-1.5 text-[11px] ${c.ok ? 'text-emerald-700' : 'text-stone-500'}`}>
            {c.ok ? <Check className="w-3 h-3 shrink-0" aria-hidden="true" /> : <X className="w-3 h-3 shrink-0" aria-hidden="true" />}
            <span>{c.label}</span>
            <span className="sr-only">{c.ok ? '(cumple)' : '(falta)'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
