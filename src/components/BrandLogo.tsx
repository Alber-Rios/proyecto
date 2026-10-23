import React from 'react';

/**
 * Logo de Spotly: "sp●tly". La "o" es un punto con ondas, como cuando un
 * mapa marca la ubicación exacta (el "spot").
 */

const ROSE = '#e11d48';

/** El símbolo solo (punto con ondas). Sirve como ícono. */
export const BrandMark: React.FC<{ className?: string; animated?: boolean }> = ({ className, animated = false }) => (
  <svg viewBox="0 0 34 34" className={className} aria-hidden="true" focusable="false">
    <circle cx="17" cy="17" r="16" fill="none" stroke={ROSE} strokeWidth="1.5" opacity="0.35" />
    <circle cx="17" cy="17" r="11" fill="none" stroke={ROSE} strokeWidth="2" opacity="0.65" />
    {animated && <circle className="brand-ping-wave" cx="17" cy="17" r="16" fill="none" stroke={ROSE} strokeWidth="1.5" />}
    <circle cx="17" cy="17" r="6" fill={ROSE} />
  </svg>
);

interface BrandLogoProps {
  /** dark = texto oscuro (fondos claros), light = texto blanco (fondos oscuros) */
  tone?: 'dark' | 'light';
  /** Clases de tamaño de letra, p. ej. "text-2xl". El símbolo escala con la letra. */
  className?: string;
  animated?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ tone = 'dark', className = 'text-2xl', animated = false }) => (
  <span
    className={`font-brand inline-flex items-baseline font-bold leading-none tracking-[-0.045em] whitespace-nowrap ${
      tone === 'light' ? 'text-white' : 'text-slate-900'
    } ${className}`}
  >
    <span aria-hidden="true">sp</span>
    <BrandMark
      animated={animated}
      className="mx-[0.02em] h-[0.72em] w-[0.72em] shrink-0 self-baseline translate-y-[0.04em]"
    />
    <span aria-hidden="true">tly</span>
    <span className="sr-only">Spotly</span>
  </span>
);
