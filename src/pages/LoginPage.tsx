import React, { useState } from 'react';
import { AuthLayout } from '../components/AuthLayout.tsx';
import { useApp } from '../context/AppContext.tsx';
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

    if (!identifier.trim()) {
      setError('Por favor ingresa tu Correo Electrónico o RUT.');
      return;
    }

    setLoading(true);
    try {
      const res = await login(identifier, password);
      if (res.success) {
        setSuccess('¡Inicio de sesión exitoso! Redirigiendo...');
        setTimeout(() => {
          onNavigate('home');
        }, 600);
      } else {
        setError(res.message || 'Credenciales no válidas. Revisa tu RUT o correo.');
      }
    } catch (err: any) {
      setError(err.message || 'Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Bienvenido de vuelta."
      description="Gestiona tus solicitudes, revisa tus contratos y sigue explorando espacios en Chile."
      points={['Contratos digitales bajo Ley N° 18.101', 'Validación de identidad', 'Pagos y liquidaciones en CLP']}
      formTitle="Iniciar sesión"
      formDescription="Ingresa con tu cuenta registrada en Spotly."
    >

            {/* Mensajes de Alerta */}
            {error && (
              <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{success}</span>
              </div>
            )}

            {/* Formulario Estándar */}
            <form onSubmit={handleSubmit} className="space-y-4 pt-1" autoComplete="off">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    name="spotly_login_id"
                    required
                    autoComplete="off"
                    data-temp-mail-org="0"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-stone-300 rounded-xl text-base sm:text-sm text-stone-900 placeholder:text-stone-400 transition duration-200 hover:border-stone-400 focus:border-brand-500 focus:outline-hidden focus:ring-4 focus:ring-brand-500/15 font-medium !bg-none"
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
                    className="text-[12.5px] font-semibold text-brand-600 hover:text-brand-700 hover:underline cursor-pointer"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-3 bg-white border border-stone-300 rounded-xl text-base sm:text-sm text-stone-900 placeholder:text-stone-400 transition duration-200 hover:border-stone-400 focus:border-brand-500 focus:outline-hidden focus:ring-4 focus:ring-brand-500/15 font-medium"
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
                    className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                  />
                  <span>Recordar mi sesión</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-[15px] rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
                className="font-semibold text-brand-600 hover:text-brand-700 hover:underline cursor-pointer"
              >
                Crear cuenta gratis
              </button>
            </div>
    </AuthLayout>
  );
};
