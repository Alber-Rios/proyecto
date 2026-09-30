import React, { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import {
  LogIn,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  ShieldCheck,
  Building2,
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
    <div className="max-w-5xl mx-auto py-2 sm:py-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Columna Izquierda: Información de Marca y Garantías */}
        <div className="lg:col-span-5 bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950 text-white p-5 sm:p-7 lg:p-8 flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-4 sm:space-y-5 relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-rose-600 flex items-center justify-center text-white shadow-lg shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg sm:text-xl font-bold tracking-tight text-white block leading-tight">
                  Spotly
                </span>
                <span className="text-[10px] text-slate-400 tracking-wider uppercase block">
                  Espacios Chile
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-1 sm:pt-2">
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-snug">
                Bienvenido de vuelta a tu plataforma de arriendos
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Accede a tu panel para gestionar solicitudes, revisar tus contratos de arriendo y explorar los mejores recintos comerciales en Chile.
              </p>
            </div>

            <div className="space-y-2.5 pt-2 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Contratos digitales bajo Ley N° 18.101</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Validación de identidad biométrica</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Liquidaciones automáticas en CLP</span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 pt-4 mt-4 relative z-10 border-t border-slate-800/80">
            © 2026 Spotly SpA • Santiago de Chile
          </div>

          {/* Efecto de luz */}
          <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full bg-rose-600/20 blur-3xl pointer-events-none" />
        </div>

        {/* Columna Derecha: Formulario */}
        <div className="lg:col-span-7 p-5 sm:p-7 lg:p-8 flex flex-col justify-center">
          <div className="max-w-md w-full mx-auto space-y-4">
            {/* Header del Formulario */}
            <div className="space-y-1">
              <h3 className="text-2xl font-bold text-slate-900">Iniciar Sesión</h3>
              <p className="text-xs text-slate-500">
                Ingresa con tu cuenta registrada en Spotly Chile.
              </p>
            </div>

            {/* Mensajes de Alerta */}
            {error && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{success}</span>
              </div>
            )}

            {/* Formulario Estándar */}
            <form onSubmit={handleSubmit} className="space-y-4 pt-1" autoComplete="off">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Correo Electrónico
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
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium !bg-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
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
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
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
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-2xl shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>{loading ? 'Iniciando Sesión...' : 'Ingresar a mi Cuenta'}</span>
              </button>
            </form>

            <div className="pt-3 border-t border-slate-100 text-center text-xs text-slate-600">
              ¿Aún no tienes una cuenta?{' '}
              <button
                type="button"
                onClick={() => onNavigate('register')}
                className="font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
              >
                Crear cuenta gratis
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
