import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MailCheck, RotateCw } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { useGuestOnly } from '../hooks/useGuestOnly.ts';
import { AuthAlert, AuthCard, inputClass, primaryButton } from '../components/AuthCard.tsx';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

const maskEmail = (email: string) => {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  const visible = user.length <= 2 ? user[0] : `${user.slice(0, 2)}`;
  return `${visible}${'•'.repeat(Math.max(user.length - visible.length, 1))}@${domain}`;
};

// Paso final del registro: el usuario escribe el código de 6 dígitos que llegó a su
// correo. Hasta entonces la cuenta no está activa ni puede iniciar sesión.
export const VerifyEmailPage: React.FC = () => {
  const { verifyEmail, resendVerificationCode } = useApp();
  const { submitting, redirecting, finish } = useGuestOnly();
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state || {}) as { email?: string; from?: string; resend?: boolean };

  const [email, setEmail] = useState(state.email || '');
  const [editingEmail, setEditingEmail] = useState(!state.email);
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(state.resend ? 0 : RESEND_SECONDS);
  const [verified, setVerified] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const autoResent = useRef(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    if (!email || cooldown > 0) return;
    setError(null);
    const r = await resendVerificationCode(email);
    if (r.success) {
      setInfo(r.message || 'Te enviamos un código nuevo.');
      setCooldown(RESEND_SECONDS);
      setDigits(Array(CODE_LENGTH).fill(''));
      inputs.current[0]?.focus();
    } else setError(r.message || 'No se pudo reenviar el código.');
  };

  // Desde "Iniciar sesión" con el correo sin verificar se envía un código nuevo al llegar.
  useEffect(() => {
    if (state.resend && state.email && !autoResent.current) {
      autoResent.current = true;
      void resend();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (code: string) => {
    if (loading) return;
    if (code.length !== CODE_LENGTH) {
      setError(`Ingresa los ${CODE_LENGTH} dígitos del código.`);
      return;
    }
    setError(null);
    setInfo(null);
    setLoading(true);
    submitting.current = true;
    const r = await verifyEmail(email, code);
    setLoading(false);
    if (r.success) {
      setVerified(true);
      // Se muestra un instante la confirmación y se vuelve a la página de origen.
      window.setTimeout(() => finish(), 900);
    } else {
      submitting.current = false;
      setError(r.message || 'Código incorrecto.');
      setDigits(Array(CODE_LENGTH).fill(''));
      inputs.current[0]?.focus();
    }
  };

  const setDigit = (i: number, value: string) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length > 1) {
      // Pegar el código completo
      const next = clean.slice(0, CODE_LENGTH).split('');
      const filled = [...next, ...Array(CODE_LENGTH - next.length).fill('')];
      setDigits(filled);
      inputs.current[Math.min(next.length, CODE_LENGTH - 1)]?.focus();
      if (next.length === CODE_LENGTH) void submit(next.join(''));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < CODE_LENGTH - 1) inputs.current[i + 1]?.focus();
    if (next.every((d) => d)) void submit(next.join(''));
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < CODE_LENGTH - 1) inputs.current[i + 1]?.focus();
  };

  if (redirecting && !verified) return null;

  return (
    <AuthCard
      icon={<MailCheck className="w-7 h-7" />}
      title="Verifica tu correo"
      description={
        editingEmail ? (
          'Escribe el correo con el que te registraste para ingresar el código de verificación.'
        ) : (
          <>
            Enviamos un código de {CODE_LENGTH} dígitos a <strong className="text-slate-900">{maskEmail(email)}</strong>. Escríbelo aquí para activar tu cuenta.
          </>
        )
      }
    >
      {verified && <AuthAlert kind="success">¡Correo verificado! Tu cuenta ya está activa. Entrando…</AuthAlert>}
      {error && <AuthAlert kind="error">{error}</AuthAlert>}
      {info && !error && <AuthAlert kind="info">{info}</AuthAlert>}

      {editingEmail ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
              setError('Ingresa un correo electrónico válido.');
              return;
            }
            setEmail(email.trim().toLowerCase());
            setEditingEmail(false);
            setError(null);
          }}
        >
          <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} aria-label="Correo electrónico" />
          <button type="submit" className={primaryButton}>Continuar</button>
        </form>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(digits.join(''));
          }}
        >
          <fieldset disabled={loading || verified}>
            <legend className="sr-only">Código de verificación</legend>
            <div className="flex justify-center gap-2 sm:gap-3">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputs.current[i] = el;
                  }}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  onFocus={(e) => e.target.select()}
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  pattern="[0-9]*"
                  maxLength={i === 0 ? CODE_LENGTH : 1}
                  aria-label={`Dígito ${i + 1} de ${CODE_LENGTH}`}
                  autoFocus={i === 0}
                  className="w-11 h-14 sm:w-12 sm:h-16 text-center text-2xl font-bold text-slate-900 bg-white border-2 border-stone-300 rounded-xl focus:border-rose-500 focus:outline-hidden focus:ring-4 focus:ring-rose-500/15 transition"
                />
              ))}
            </div>
          </fieldset>

          <button type="submit" disabled={loading || verified} className={primaryButton}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Verificando…' : 'Verificar y activar mi cuenta'}
          </button>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
            <button type="button" onClick={resend} disabled={cooldown > 0} className="font-bold text-rose-600 hover:text-rose-700 disabled:text-slate-400 inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed">
              <RotateCw className="w-3.5 h-3.5" />
              {cooldown > 0 ? `Reenviar código en ${cooldown} s` : 'Reenviar código'}
            </button>
            <button type="button" onClick={() => { setEditingEmail(true); setDigits(Array(CODE_LENGTH).fill('')); }} className="font-semibold text-slate-500 hover:text-slate-800 cursor-pointer">
              Cambiar correo
            </button>
          </div>

          <p className="text-[11px] text-slate-500 text-center leading-relaxed">
            El código vence en 15 minutos. ¿No llegó? Revisa la carpeta de spam o promociones. Si no lo validas, la cuenta se elimina a las 24 horas.
          </p>
        </form>
      )}

      <div className="text-center">
        <button type="button" onClick={() => navigate('/login', { replace: true })} className="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Volver a iniciar sesión
        </button>
      </div>
    </AuthCard>
  );
};
