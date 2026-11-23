import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Bell, Check, Eye, Search } from 'lucide-react';

// Confirmación al publicar o editar un espacio (reemplaza el alert del navegador).

interface Props {
  kind: 'published' | 'edited';
  title: string;
  onViewSpaces: () => void;
  onClose: () => void;
}

const STEPS = [
  { icon: Eye, title: 'Lo revisamos', text: 'Administración comprueba fotos, precio y datos del lugar.' },
  { icon: Bell, title: 'Te avisamos', text: 'Recibes una notificación cuando quede aprobado o si falta algo.' },
  { icon: Search, title: 'Aparece en Spotly', text: 'Ya aprobado, cualquiera puede encontrarlo y reservarlo.' },
];

export const PublishSuccessDialog: React.FC<Props> = ({ kind, title, onViewSpaces, onClose }) => {
  const titleId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:pb-6"
        initial={reduce ? { opacity: 0 } : { y: 32, opacity: 0, scale: 0.98 }}
        animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
        onClick={(e) => e.stopPropagation()}
      >
        <motion.span
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
          initial={reduce ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', delay: 0.08, duration: 0.45, bounce: 0.4 }}
          aria-hidden="true"
        >
          <Check className="h-7 w-7" strokeWidth={3} />
        </motion.span>

        <h2 id={titleId} className="mt-4 text-center text-xl font-bold tracking-tight text-slate-950">
          {kind === 'published' ? '¡Listo! Tu espacio está en revisión' : 'Cambios guardados'}
        </h2>
        <p className="mt-1 text-center text-sm text-slate-600">
          <span className="font-semibold text-slate-900">«{title}»</span>{' '}
          {kind === 'published' ? 'ya nos llegó.' : 'quedó actualizado.'}
        </p>

        {kind === 'published' && (
          <ol className="mt-5 space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <s.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">
                    {i + 1}. {s.title}
                  </span>
                  <span className="block text-sm text-slate-600">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            ref={primaryRef}
            type="button"
            onClick={onViewSpaces}
            className="min-h-11 flex-1 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] cursor-pointer"
          >
            Ver mis espacios
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 active:scale-[0.98] cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
};
