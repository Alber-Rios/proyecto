import React, { useState } from 'react';
import { AuthLayout } from '../components/AuthLayout.tsx';
import { useApp } from '../context/AppContext.tsx';
import { useGuestOnly } from '../hooks/useGuestOnly.ts';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LogIn,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface LoginPageProps {
  onNavigate: (view: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { login } = useApp();
  const { submitting, finish, redirecting, target } = useGuestOnly();
  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    setUnverifiedEmail(null);
    if (!identifier.trim() || !identifier.includes('@')) {
      setError('Ingresa el correo electrónico con el que te registraste.');
      return;
    }

    setLoading(true);
    submitting.current = true;
    try {
      const res = await login(identifier, password, rememberMe);
      if (res.success) {
        setSuccess('¡Inicio de sesión con éxito! Te estamos llevando a tu cuenta…');
        setTimeout(() => finish(), 500);
      } else {
        submitting.current = false;
        if (res.code === 'EMAIL_NOT_CONFIRMED') {
          setUnverifiedEmail(identifier.trim().toLowerCase());
          setError(res.message || 'Tu correo aún no está verificado.');
        } else if (res.status === 429 || (res.status === 403 && res.message)) {
          // Bloqueo por intentos fallidos o cuenta suspendida: se muestra el motivo.
          setError(res.message || 'Acceso bloqueado temporalmente.');
        } else if (!res.status || res.status >= 500 || res.status === 404) {
          setError('No pudimos conectar con el servidor de inicio de sesión. Inténtalo nuevamente en unos minutos.');
        } else {
          setError('Credenciales inválidas. Revisa tu correo electrónico o contraseña.');
        }
      }
    } catch (err: any) {
      submitting.current = false;
      setError(err.message || 'Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  if (redirecting) return null;

  return (
    <AuthLayout
      title="Bienvenido de vuelta."
      description="Gestiona tus solicitudes, revisa tus contratos y sigue explorando espacios en Chile."
      points={['Contratos digitales bajo Ley N° 18.101', 'Validación de identidad', 'Pagos y liquidaciones en CLP']}
      formTitle="Iniciar sesión"
      formDescription="Ingresa con tu cuenta registrada en Spotly."
    >

            {/* Mensajes de Alerta */}
            {notice && !error && !success && (
              <div className="p-3.5 bg-sky-50 border border-sky-200 text-sky-900 text-xs rounded-xl flex items-center gap-2 font-medium" role="status">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-sky-600" />
                <span>{notice}</span>
              </div>
            )}

            {error && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex flex-wrap items-center gap-2 font-medium" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span className="flex-1 min-w-0">{error}</span>
                {unverifiedEmail && (
                  <button
                    type="button"
                    onClick={() => navigate('/verificar-correo', { replace: true, state: { email: unverifiedEmail, from: target, resend: true } })}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-700 cursor-pointer"
                  >
                    Verificar mi correo
                  </button>
                )}
              </div>
            )}

            {success && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{success}</span>
              </div>
            )}

            {/* Formulario Estándar */}
            <form onSubmit={handleSubmit} className="space-y-4 pt-1">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    name="email"
                    required
                    autoComplete="username"
                    inputMode="email"
                    maxLength={254}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-stone-300 rounded-xl text-base sm:text-sm text-stone-900 placeholder:text-stone-400 transition duration-200 hover:border-stone-400 focus:border-rose-500 focus:outline-hidden focus:ring-4 focus:ring-rose-500/15 font-medium !bg-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-sm font-medium text-stone-700">
                    Contraseña
                  </label>
                  <button
                    type="button"
                    onClick={() => onNavigate('forgot-password')}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    required
                    autoComplete="current-password"
                    maxLength={72}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-3 bg-white border border-stone-300 rounded-xl text-base sm:text-sm text-stone-900 placeholder:text-stone-400 transition duration-200 hover:border-stone-400 focus:border-rose-500 focus:outline-hidden focus:ring-4 focus:ring-rose-500/15 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                  />
                  <span>Recordar mi sesión</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="shine group w-full py-3.5 bg-stone-950 hover:bg-rose-600 text-white font-semibold text-sm rounded-full shadow-[0_14px_30px_-12px_rgba(12,10,9,0.55)] transition-[background-color,transform] duration-300 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>{loading ? 'Iniciando sesión...' : 'Ingresar a mi cuenta'}</span>
              </button>
            </form>

            <div className="pt-5 border-t border-stone-100 text-center text-sm text-stone-600">
              ¿Aún no tienes una cuenta?{' '}
              <button
                type="button"
                onClick={() => onNavigate('register')}
                className="font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
              >
                Crear cuenta gratis
              </button>
            </div>
    </AuthLayout>
  );
};
