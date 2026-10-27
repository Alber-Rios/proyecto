import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

/** Tarjeta centrada para los pasos cortos de acceso (código, recuperar y restablecer contraseña). */
export const AuthCard: React.FC<{ icon: React.ReactNode; title: string; description: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  title,
  description,
  children,
}) => (
  <div className="max-w-xl mx-auto py-4 sm:py-8">
    <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xl p-5 sm:p-8 space-y-5">
      <div className="text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-xs">{icon}</div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <div className="text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">{description}</div>
      </div>
      {children}
    </div>
  </div>
);

export const AuthAlert: React.FC<{ kind: 'error' | 'success' | 'info'; children: React.ReactNode }> = ({ kind, children }) => {
  const styles = {
    error: 'bg-rose-50 border-rose-200 text-rose-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    info: 'bg-sky-50 border-sky-200 text-sky-900',
  }[kind];
  const Icon = kind === 'error' ? AlertCircle : CheckCircle2;
  return (
    <div className={`p-3.5 border text-xs rounded-2xl flex items-start gap-2 font-medium ${styles}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon className="w-4 h-4 shrink-0 mt-px" />
      <div className="min-w-0">{children}</div>
    </div>
  );
};

export const inputClass =
  'w-full px-3.5 py-3 bg-white border border-stone-300 rounded-xl text-base sm:text-sm text-stone-900 placeholder:text-stone-400 transition duration-200 hover:border-stone-400 focus:border-rose-500 focus:outline-hidden focus:ring-4 focus:ring-rose-500/15 font-medium';
export const primaryButton =
  'w-full py-3.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer';
