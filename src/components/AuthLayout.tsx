import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { HeroBookingDemo, HERO_SCENES, useHeroScene } from './HeroBookingDemo.tsx';

interface AuthLayoutProps {
  title: string;
  description: string;
  points: string[];
  formTitle: string;
  formDescription: string;
  children: React.ReactNode;
}

/** Marco común de iniciar sesión / crear cuenta: formulario + panel con la reserva en vivo. */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, description, points, formTitle, formDescription, children }) => {
  const reduce = useReducedMotion();
  const { spaces } = useApp();
  const sceneIndex = useHeroScene(HERO_SCENES.length);
  const scene = HERO_SCENES[sceneIndex];
  const sceneSpace = useMemo(
    () => spaces.find((s) => s.status === 'active' && scene.categories.includes(s.category) && Boolean(s.pricePerHour)),
    [spaces, scene]
  );
  const enter = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] as const, delay },
  });

  return (
    <div className="mx-auto max-w-6xl py-4 sm:py-8">
      <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-2 lg:gap-6">
        {/* Formulario */}
        <div className="flex flex-col justify-center lg:py-10 lg:pr-10">
          <div className="mx-auto w-full max-w-md space-y-7">
            <motion.div {...enter(0)} className="space-y-2">
              <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.035em] text-slate-950 sm:text-[2.4rem]">{formTitle}</h1>
              <p className="text-[15px] text-slate-600">{formDescription}</p>
            </motion.div>
            <motion.div {...enter(0.06)} className="space-y-5">
              {children}
            </motion.div>
          </div>
        </div>

        {/* Panel visual */}
        <motion.aside
          initial={reduce ? false : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1], delay: 0.1 }}
          className="relative hidden overflow-hidden rounded-[2rem] bg-slate-50 bg-[radial-gradient(28rem_20rem_at_100%_0%,var(--color-brand-100),transparent_70%)] p-10 lg:flex lg:flex-col lg:justify-between"
        >
          <div className="relative space-y-3">
            <h2 className="text-[1.6rem] font-semibold leading-tight tracking-[-0.03em] text-slate-950">{title}</h2>
            <p className="max-w-sm text-[15px] leading-relaxed text-slate-600">{description}</p>
            <ul className="space-y-2 pt-2 text-[14px] text-slate-700">
              {points.map((point) => (
                <li key={point} className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.5} />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mt-10">
            <HeroBookingDemo scene={scene} sceneIndex={sceneIndex} space={sceneSpace} />
          </div>
        </motion.aside>
      </div>
    </div>
  );
};
