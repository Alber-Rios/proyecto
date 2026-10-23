import React, { useLayoutEffect, useRef } from 'react';
import { animate } from 'animejs';

/**
 * Texto con un número que "cuenta" hasta su valor (Anime.js).
 * Acepta textos ya formateados: "$1.234.567", "25%", "$1,2M", "8".
 * Toma el primer número del texto, lo anima desde 0 (o desde el valor
 * anterior cuando cambia) y conserva el prefijo, el sufijo y el formato
 * chileno (punto para miles, coma para decimales).
 */

const parse = (text: string) => {
  const m = text.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/);
  if (!m || m.index === undefined) return null;
  const raw = m[0];
  const decimals = raw.includes(',') ? raw.split(',')[1].length : 0;
  const value = Number(raw.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  return { prefix: text.slice(0, m.index), suffix: text.slice(m.index + raw.length), value, decimals };
};

const formatCl = (v: number, decimals: number) =>
  v.toLocaleString('es-CL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const AnimatedNumber: React.FC<{
  text: string;
  className?: string;
  /** ms */
  duration?: number;
}> = ({ text, className, duration = 1400 }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const parsed = parse(text);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !parsed) return;
    const { prefix, suffix, value, decimals } = parsed;
    const render = (v: number) => {
      el.textContent = `${prefix}${formatCl(v, decimals)}${suffix}`;
    };
    if (prefersReduced()) {
      render(value);
      shown.current = value;
      return;
    }

    const from = shown.current ?? 0;
    const counter = { v: from };
    let anim: ReturnType<typeof animate> | null = null;

    const run = () => {
      anim = animate(counter, {
        v: value,
        duration: shown.current === null ? duration : Math.min(700, duration),
        ease: 'outExpo',
        onUpdate: () => render(counter.v),
        onComplete: () => {
          render(value);
          shown.current = value;
        },
      });
    };

    // La primera vez espera a que el número se vea en pantalla.
    if (shown.current === null && 'IntersectionObserver' in window) {
      render(0);
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            run();
          }
        },
        { threshold: 0.4 }
      );
      io.observe(el);
      return () => {
        io.disconnect();
        anim?.pause();
        if (shown.current === null) render(value);
      };
    }
    run();
    return () => {
      anim?.pause();
      shown.current = counter.v;
    };
  }, [text]);

  if (!parsed) return <span className={className}>{text}</span>;
  return (
    <span className={`tabular-nums ${className ?? ''}`}>
      {/* El contenido de este span lo escribe la animación, no React. */}
      <span ref={ref} aria-hidden="true" />
      <span className="sr-only">{text}</span>
    </span>
  );
};
