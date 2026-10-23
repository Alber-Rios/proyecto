import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'spotly-cookie-notice';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

// Spotly solo usa almacenamiento esencial (sesión y preferencias), por eso el aviso
// informa y no pide elegir. Si se agrega analítica o publicidad, debe pedir consentimiento.
export const CookieBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed) return null;

  const accept = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Sin almacenamiento disponible el aviso vuelve a aparecer en la próxima visita.
    }
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-stone-200 bg-white p-4 shadow-lg sm:inset-x-6 sm:bottom-6 sm:flex sm:items-center sm:gap-4"
    >
      <p className="text-sm leading-relaxed text-slate-700">
        Usamos cookies y almacenamiento local solo para mantener tu sesión y que el sitio funcione. No usamos
        cookies de publicidad ni de seguimiento.{' '}
        <Link to="/cookies" className="font-semibold text-rose-700 underline underline-offset-2">
          Leer la política de cookies
        </Link>
      </p>
      <button
        type="button"
        onClick={accept}
        className="mt-3 w-full shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 sm:mt-0 sm:w-auto"
      >
        Entendido
      </button>
    </div>
  );
};
