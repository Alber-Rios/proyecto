import React from 'react';
import { BrandLogo } from './BrandLogo.tsx';
import { motion } from 'motion/react';
import { useReducedMotion } from '../lib/motionPreference.ts';
import { Check } from 'lucide-react';
import { EASE_LUXE } from './motion/Motion.tsx';

interface AuthLayoutProps {
  title: string;
  description: string;
  points: string[];
  formTitle: string;
  formDescription: string;
  children: React.ReactNode;
}

/** Marco común de iniciar sesión / crear cuenta: panel de marca oscuro + formulario. */
export const AuthLayout: React.FC<AuthLayoutProps> = ({
  title,
  description,
  points,
  formTitle,
  formDescription,
  children,
}) => {
  const reduce = useReducedMotion();
  const enter = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, ease: EASE_LUXE, delay },
  });

  return (
    <div className="max-w-5xl mx-auto py-2 sm:py-6">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: EASE_LUXE }}
        className="grid grid-cols-1 lg:grid-cols-12 bg-white rounded-[2rem] border border-stone-200/80 shadow-[0_40px_90px_-40px_rgba(12,10,9,0.45)] overflow-hidden"
      >
        {/* Panel de marca */}
        <div className="grain lg:col-span-5 bg-stone-950 text-white p-7 sm:p-9 lg:p-10 flex flex-col justify-between relative overflow-hidden min-h-[17rem] lg:min-h-[38rem]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="aurora-a absolute -top-1/3 -right-1/2 h-[28rem] w-[28rem] rounded-full bg-rose-600/35 blur-[100px]" />
            <div className="aurora-b absolute -bottom-1/3 -left-1/3 h-[24rem] w-[24rem] rounded-full bg-amber-500/20 blur-[110px]" />
          </div>

          <div className="relative z-10 space-y-8">
            <motion.div {...enter(0.1)} className="flex">
              <BrandLogo tone="light" animated className="text-3xl" />
            </motion.div>

            <div className="space-y-3">
              <motion.h2 {...enter(0.2)} className="font-display text-3xl sm:text-4xl leading-[1.08] tracking-tight">
                {title}
              </motion.h2>
              <motion.p {...enter(0.3)} className="text-sm text-stone-300 leading-relaxed max-w-sm">
                {description}
              </motion.p>
            </div>

            <ul className="hidden sm:block space-y-3 text-sm text-stone-200">
              {points.map((point, i) => (
                <motion.li key={point} {...enter(0.4 + i * 0.08)} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10">
                    <Check className="h-3.5 w-3.5 text-rose-300" />
                  </span>
                  <span>{point}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          <p className="relative z-10 hidden lg:block text-xs text-stone-500 pt-6">© 2026 Spotly · Santiago de Chile</p>
        </div>

        {/* Formulario */}
        <div className="lg:col-span-7 p-6 sm:p-9 lg:p-12 flex flex-col justify-center">
          <div className="max-w-md w-full mx-auto space-y-6">
            <motion.div {...enter(0.15)} className="space-y-1.5">
              <h1 className="font-display text-4xl tracking-tight text-stone-900">{formTitle}</h1>
              <p className="text-sm text-stone-500">{formDescription}</p>
            </motion.div>
            <motion.div {...enter(0.25)} className="space-y-5">
              {children}
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
