import React from 'react';
import { ArrowRight } from 'lucide-react';

interface NotFoundPageProps {
  onNavigate: (view: string) => void;
  showLogin?: boolean;
  restricted?: boolean;
}

function SpaceNotFoundIllustration() {
  return (
    <svg
      viewBox="0 0 620 470"
      role="img"
      aria-label="Ilustración de un espacio con un aviso de error 404"
      className="h-auto w-full max-w-[620px]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="60" y="28" width="235" height="330" rx="8" fill="#fff" stroke="#dbe3e8" />
      <rect x="320" y="28" width="235" height="330" rx="8" fill="#fff" stroke="#dbe3e8" />
      <g fill="#edf1f3">
        <path d="M90 94c-18 0-21-20-6-26 4-17 30-20 41-7 14-15 41-8 44 10 17-5 32 3 35 15H90Z" />
        <path d="M348 122c-16 0-18-17-5-23 3-15 27-18 37-6 12-13 36-7 39 9 14-4 28 3 31 13h-102Z" />
      </g>

      {/* Edificio */}
      <path d="M117 181 282 91l179 83 112 35-7 22-111-33v167H136V190Z" fill="#aec0c6" />
      <path d="m102 183 180-98 182 84" fill="none" stroke="#64818d" strokeWidth="8" strokeLinejoin="round" />
      <path d="m459 174 121 37-9 18-112-34" fill="#64818d" />
      <path d="M136 190h319v175H136z" fill="#e8edef" />
      <circle cx="282" cy="145" r="34" fill="#f8fafb" stroke="#64818d" strokeWidth="8" />

      {/* Ventanas y acceso */}
      <rect x="166" y="220" width="126" height="111" fill="#f8fafb" stroke="#aec0c6" strokeWidth="8" />
      <path d="M166 274h126M229 220v111" stroke="#aec0c6" strokeWidth="7" />
      <rect x="350" y="215" width="78" height="150" fill="#64818d" stroke="#64818d" strokeWidth="7" />
      <rect x="361" y="228" width="55" height="123" fill="#7895a0" />
      <circle cx="419" cy="288" r="4" fill="#f8fafb" />
      <path d="M338 367h101v14H338zm-10 17h120v13H328z" fill="#829da6" />

      {/* Edificio contiguo */}
      <path d="M459 242h72v42h-72m0 18h72v42h-72" fill="none" stroke="#64818d" strokeWidth="7" />

      {/* Suelo, arbustos y sombra */}
      <path d="M20 398h580M104 414h430" stroke="#ccd7db" strokeWidth="2" />
      <ellipse cx="313" cy="431" rx="239" ry="17" fill="#eef1f2" />
      <g fill="#afc0c6">
        <path d="M67 396c-28-11-34-39-16-45 5-15 22-13 30-1 11-20 31-11 29 8 18-5 28 19 15 38H67Zm439 0c-15-18-2-39 14-34-3-20 18-30 29-11 13-10 27-1 24 15 20 3 19 24-1 30h-66Z" />
      </g>

      {/* Letrero de error */}
      <path d="M294 340v75" stroke="#ffb0a3" strokeWidth="17" />
      <g transform="rotate(5 300 288)">
        <path d="M200 255h190v112H200z" fill="#ff503d" />
        <path d="M377 255h13v112h-13z" fill="#df3d30" />
        <path d="M214 276h164M214 348h164" stroke="#ff705f" strokeWidth="2" opacity=".6" />
        <text x="295" y="302" fill="#fff0ec" textAnchor="middle" fontSize="36" fontWeight="700" fontFamily="Arial, sans-serif">ERROR</text>
        <text x="295" y="344" fill="#fff0ec" textAnchor="middle" fontSize="36" fontWeight="700" fontFamily="Arial, sans-serif">404</text>
      </g>
    </svg>
  );
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({
  onNavigate,
  showLogin = false,
  restricted = false,
}) => (
  <section className="mx-auto flex min-h-[calc(100vh-15rem)] max-w-6xl items-center px-5 py-12 sm:px-8 lg:px-10">
    <div className="grid w-full items-center gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12">
      <div className="max-w-xl">
        <p className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">¡Oops!</p>
        <h1 className="mt-3 text-3xl font-medium leading-tight tracking-tight text-slate-950 sm:text-4xl">
          {restricted ? 'Llegaste a una vista restringida.' : 'Llegaste al lugar equivocado.'}
        </h1>
        <p className="mt-7 max-w-lg text-lg leading-relaxed text-slate-700 sm:text-xl">
          {restricted
            ? 'Esta sección no está disponible para tu cuenta. Te ayudamos a volver a Spotly y seguir buscando espacios.'
            : 'Esta página no está disponible, pero puedes regresar a Spotly y seguir buscando espacios.'}
        </p>
        <div className="mt-12 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="inline-flex min-h-12 min-w-64 items-center justify-center gap-2 rounded-full bg-rose-600 px-8 py-3 text-base font-bold text-white shadow-sm transition hover:bg-rose-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
          >
            Regresar a Spotly <ArrowRight className="h-4 w-4" />
          </button>
          {showLogin ? (
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="min-h-12 rounded-full px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Iniciar sesión
            </button>
          ) : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[620px] lg:justify-self-end">
        <SpaceNotFoundIllustration />
      </div>
    </div>
  </section>
);
