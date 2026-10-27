import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { PasswordStrength } from '../components/PasswordStrength.tsx';
import { AuthAlert, AuthCard, inputClass, primaryButton } from '../components/AuthCard.tsx';
import { passwordProblem } from '../utils/passwordPolicy.ts';

type ResetLink = { token_hash?: string; access_token?: string; error?: string };

// Lee el enlace del correo. Acepta los dos formatos de Supabase:
//   ?token_hash=...&type=recovery   (correo de Spotly o plantilla personalizada)
//   #access_token=...&type=recovery (plantilla por defecto de Supabase)
function readResetLink(): ResetLink {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const error = hash.get('error_description') || query.get('error_description');
  if (error) return { error };
  const tokenHash = query.get('token_hash');
  if (tokenHash && (query.get('type') || 'recovery') === 'recovery') return { token_hash: tokenHash };
  const accessToken = hash.get('access_token');
  if (accessToken && hash.get('type') === 'recovery') return { access_token: accessToken };
  return {};
}

// Paso 2 de la recuperación: desde el enlace del correo se elige la nueva contraseña.
export const ResetPasswordPage: React.FC = () => {
  const { resetPassword } = useApp();
  const navigate = useNavigate();
  const link = useMemo(readResetLink, []);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(Boolean(link.error) || (!link.token_hash && !link.access_token));

  // El token no debe quedar en la barra de direcciones ni en el historial.
  useEffect(() => {
    if (window.location.search || window.location.hash) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError('Las contraseñas no coinciden.');
    setLoading(true);
    const r = await resetPassword({ token_hash: link.token_hash, access_token: link.access_token }, password);
    setLoading(false);
    if (r.success) {
      navigate('/login', { replace: true, state: { notice: r.message || 'Tu contraseña se actualizó. Inicia sesión con la nueva.' } });
    } else if (r.code === 'LINK_INVALID') {
      setLinkInvalid(true);
    } else {
      setError(r.message || 'No se pudo guardar la contraseña.');
    }
  };

  if (linkInvalid) {
    return (
      <AuthCard icon={<LockKeyhole className="w-7 h-7" />} title="El enlace no es válido" description="El enlace para restablecer la contraseña venció, ya se usó o está incompleto.">
        <AuthAlert kind="error">{link.error || 'Por seguridad, cada enlace dura 1 hora y sirve una sola vez.'}</AuthAlert>
        <button type="button" onClick={() => navigate('/forgot-password', { replace: true })} className={primaryButton}>
          Pedir un enlace nuevo
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard icon={<LockKeyhole className="w-7 h-7" />} title="Crea una nueva contraseña" description="Elige una contraseña que no uses en otros sitios. Al guardarla se cerrarán las sesiones abiertas en otros dispositivos.">
      {error && <AuthAlert kind="error">{error}</AuthAlert>}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Campo oculto para que el gestor de contraseñas asocie la nueva clave a la cuenta. */}
        <input type="text" name="username" autoComplete="username" className="hidden" tabIndex={-1} aria-hidden="true" readOnly />
        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-stone-700 mb-1.5">Nueva contraseña</label>
          <div className="relative">
            <input
              id="new-password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              required
              maxLength={72}
              aria-describedby="reset-password-rules"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pr-11`}
            />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <PasswordStrength id="reset-password-rules" password={password} />
        </div>
        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-stone-700 mb-1.5">Repite la nueva contraseña</label>
          <input id="confirm-password" type={show ? 'text' : 'password'} autoComplete="new-password" required maxLength={72} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </div>
        <button type="submit" disabled={loading} className={primaryButton}>
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? 'Guardando…' : 'Guardar nueva contraseña'}
        </button>
      </form>
    </AuthCard>
  );
};
