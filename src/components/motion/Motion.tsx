import React, { useRef } from 'react';
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useMotionValue,
  useMotionTemplate,
  type Variants,
} from 'motion/react';

// Curva "expo out": arranca rápido y se asienta suave, la sensación de producto caro.
export const EASE_LUXE = [0.16, 1, 0.3, 1] as const;

/** Aparece al entrar en pantalla (una sola vez). */
export const Reveal: React.FC<{
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}> = ({ children, delay = 0, y = 28, className }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none', transform: 'none' } }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.9, ease: EASE_LUXE, delay }}
    >
      {children}
    </motion.div>
  );
};

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 32, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.8, ease: EASE_LUXE } },
};

/** Contenedor que escalona la entrada de sus hijos <motion.* variants={staggerChild}>. */
export const Stagger: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={staggerParent}
      initial={reduce ? false : 'hidden'}
      whileInView="show"
      viewport={{ once: true, margin: '-40px' }}
    >
      {children}
    </motion.div>
  );
};

/** Título que se revela palabra por palabra desde una máscara. */
export const SplitWords: React.FC<{ text: string; className?: string; delay?: number }> = ({ text, className, delay = 0 }) => {
  const reduce = useReducedMotion();
  const words = text.split(' ');
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden="true" className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom">
          <motion.span
            className="inline-block"
            initial={reduce ? false : { y: '110%', rotate: 4 }}
            animate={{ y: '0%', rotate: 0 }}
            transition={{ duration: 1, ease: EASE_LUXE, delay: delay + i * 0.06 }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  );
};

/** Barra fina de progreso de lectura en la parte superior. */
export const ScrollProgress: React.FC = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });
  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-rose-500 via-amber-400 to-rose-500"
    />
  );
};

/** Superficie con brillo que sigue al cursor (solo punteros finos). */
export const Spotlight: React.FC<{ children: React.ReactNode; className?: string; color?: string }> = ({
  children,
  className,
  color = 'rgba(244,63,94,0.18)',
}) => {
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const bg = useMotionTemplate`radial-gradient(520px circle at ${x}px ${y}px, ${color}, transparent 70%)`;
  return (
    <div
      className={`group/spot relative ${className ?? ''}`}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - r.left);
        y.set(e.clientY - r.top);
      }}
    >
      <motion.div
        aria-hidden="true"
        style={{ background: bg }}
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-500 group-hover/spot:opacity-100"
      />
      {children}
    </div>
  );
};

/** Botón que se "atrae" levemente hacia el cursor. */
export const Magnetic: React.FC<{ children: React.ReactNode; strength?: number }> = ({ children, strength = 0.25 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 220, damping: 18 });
  const y = useSpring(0, { stiffness: 220, damping: 18 });
  return (
    <motion.div
      ref={ref}
      style={{ x, y }}
      className="inline-flex"
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== 'mouse' || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
};

/**
 * Transición entre páginas: fundido + leve desplazamiento + desenfoque.
 * Al terminar se quitan filter y transform: si quedan (aunque sea blur(0px)),
 * el contenedor pasa a ser el bloque contenedor de los elementos `position: fixed`
 * y los modales dejan de centrarse en la ventana.
 */
export const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none', transform: 'none' } }}
      exit={reduce ? undefined : { opacity: 0, y: -8, transition: { duration: 0.2, ease: 'easeIn' } }}
      transition={{ duration: 0.55, ease: EASE_LUXE }}
    >
      {children}
    </motion.div>
  );
};

/**
 * Contenido de una pestaña: al cambiar de pestaña entra con un fundido y un
 * leve desplazamiento. No deja transform al terminar (los modales `fixed`
 * internos siguen centrados en la ventana).
 */
export const TabPanel: React.FC<{ tabKey: string; children: React.ReactNode; className?: string }> = ({
  tabKey,
  children,
  className,
}) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={tabKey}
      className={className}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, transitionEnd: { transform: 'none' } }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
};
