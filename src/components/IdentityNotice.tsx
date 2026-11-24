import React from 'react';
import { AlertCircle, Clock, ShieldCheck } from 'lucide-react';
import type { UserProfile } from '../types.ts';

// Aviso fijo en los paneles mientras la identidad no esté verificada. El texto
// depende del estado y del rol, para que la persona sepa qué le falta y para qué.
export const IdentityNotice: React.FC<{ user: UserProfile; onVerify: () => void }> = ({ user, onVerify }) => {
  const status = user.verificationStatus;
  if (status === 'verified') return null;
  const forWhat = user.role === 'owner' ? 'publicar tus espacios' : 'reservar';

  if (status === 'pending_review') {
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <p className="text-sm text-amber-900">
          <strong className="font-semibold text-amber-950">Tu identidad está en revisión.</strong> Te avisaremos apenas se apruebe
          (normalmente en menos de 48 horas). {user.role === 'owner' ? 'Puedes preparar tus espacios mientras tanto.' : 'Mientras tanto puedes explorar y guardar favoritos.'}
        </p>
      </div>
    );
  }

  const rejected = status === 'rejected';
  return (
    <div
      role="status"
      className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        rejected ? 'border-rose-300 bg-rose-50' : 'border-sky-200 bg-sky-50'
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        {rejected ? (
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
        ) : (
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" />
        )}
        <p className={`text-sm ${rejected ? 'text-rose-900' : 'text-sky-950'}`}>
          {rejected ? (
            <>
              <strong className="font-semibold">Tu verificación fue rechazada.</strong> Revisa el motivo y vuelve a enviar lo que falta para{' '}
              {forWhat}.
            </>
          ) : (
            <>
              <strong className="font-semibold">Verifica tu identidad para {forWhat}.</strong> Necesitas tu cédula, una selfie y tu
              certificado de antecedentes: toma unos 3 minutos.
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onVerify}
        className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition cursor-pointer ${
          rejected ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-800'
        }`}
      >
        {rejected ? 'Corregir verificación' : status === 'in_progress' ? 'Continuar verificación' : 'Verificar ahora'}
      </button>
    </div>
  );
};
