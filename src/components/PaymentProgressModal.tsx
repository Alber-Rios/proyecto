import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Loader2, ShieldCheck } from 'lucide-react';

export type PaymentProgressStep = 0 | 1 | 2;

interface PaymentProgressModalProps {
  /** Paso en curso: 0 verificar, 1 registrar contrato, 2 pagar. */
  step: PaymentProgressStep;
  method: 'card' | 'webpay';
  spaceTitle: string;
  totalLabel: string;
}

// Pantalla que se muestra mientras se procesa la reserva, para que la persona
// sepa qué está pasando y no vea el formulario "congelado".
export const PaymentProgressModal: React.FC<PaymentProgressModalProps> = ({ step, method, spaceTitle, totalLabel }) => {
  const steps = [
    { title: 'Verificando disponibilidad', text: 'Confirmamos que el horario sigue libre.' },
    { title: 'Registrando tu contrato', text: 'Guardamos el contrato firmado y tu reserva.' },
    method === 'card'
      ? { title: 'Realizando el pago', text: 'Cobrando con tu tarjeta guardada en Transbank.' }
      : { title: 'Conectando con Webpay', text: 'Te llevamos a Webpay para pagar de forma segura.' },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="payment-progress-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-7"
      >
        <div className="flex flex-col items-center text-center">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <motion.span
              className="absolute inset-0 rounded-full border-4 border-rose-100 border-t-rose-600"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
            />
            <ShieldCheck className="h-7 w-7 text-rose-600" />
          </div>
          <h2 id="payment-progress-title" className="mt-4 text-xl font-bold text-slate-900">
            Verificando y realizando tu reserva
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {spaceTitle} · <span className="font-semibold text-slate-900">{totalLabel}</span>
          </p>
        </div>

        <ol className="mt-6 space-y-3">
          {steps.map((s, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <li
                key={s.title}
                className={`flex items-start gap-3 rounded-2xl border p-3 transition-colors duration-300 ${
                  current ? 'border-rose-200 bg-rose-50/60' : done ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-100 bg-white'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    done ? 'bg-emerald-500 text-white' : current ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {done ? (
                      <motion.span key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}>
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </motion.span>
                    ) : current ? (
                      <motion.span key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      </motion.span>
                    ) : (
                      <motion.span key="num">{i + 1}</motion.span>
                    )}
                  </AnimatePresence>
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-bold ${done || current ? 'text-slate-900' : 'text-slate-400'}`}>{s.title}</span>
                  <span className={`block text-xs ${done || current ? 'text-slate-600' : 'text-slate-400'}`}>{s.text}</span>
                </span>
              </li>
            );
          })}
        </ol>

        <p className="mt-5 text-center text-[11px] text-slate-500">No cierres ni recargues esta página mientras procesamos tu reserva.</p>
      </motion.div>
    </div>,
    document.body
  );
};
