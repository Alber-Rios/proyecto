import React, { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { validateRut, formatRut, capitalizeInitial } from '../utils/formatters.ts';
import { getAdultBirthDateLimit, isAtLeast18 } from '../utils/ageValidation.ts';
import { UserGender } from '../types.ts';
import {
  UserPlus,
  Mail,
  Lock,
  User,
  Phone,
  Calendar,
  Building,
  ShieldCheck,
  Building2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface RegisterPageProps {
  onNavigate: (view: string) => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onNavigate }) => {
  const { register } = useApp();

  const [firstNames, setFirstNames] = useState('');
  const [surnames, setSurnames] = useState('');
  const [rut, setRut] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<UserGender>('prefiero_no_decir');
  const [role, setRole] = useState<'tenant' | 'owner'>('tenant');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!firstNames.trim() || !surnames.trim()) {
      setError('Ingresa tus nombres y apellidos por separado.');
      return;
    }

    if (!validateRut(rut)) {
      setError('El RUT ingresado no es válido según el algoritmo oficial Módulo 11 de Chile.');
      return;
    }

    if (!email.includes('@') || !email.includes('.')) {
      setError('Por favor ingresa un correo electrónico válido.');
      return;
    }

    if (!/^9\d{8}$/.test(phone)) {
      setError('Ingresa un teléfono móvil chileno de 9 dígitos, comenzando con 9.');
      return;
    }

    if (!password || password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres para resguardar la seguridad de tu cuenta.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas ingresadas no coinciden.');
      return;
    }

    if (!birthDate) {
      setError('Por favor ingresa tu fecha de nacimiento.');
      return;
    }

    if (!isAtLeast18(birthDate)) {
      setError('Debes tener 18 años o más para crear una cuenta.');
      return;
    }

    if (!termsAccepted) {
      setError('Debes aceptar los Términos de Servicio y la Política de Privacidad de Datos.');
      return;
    }

    setLoading(true);
    try {
      const res = await register({
        firstNames: capitalizeInitial(firstNames).trim(),
        surnames: capitalizeInitial(surnames).trim(),
        fullName: `${capitalizeInitial(firstNames).trim()} ${capitalizeInitial(surnames).trim()}`,
        rut: rut.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: `+56${phone}`,
        gender,
        birthDate,
        role,
        agreedTerms: termsAccepted,
      });

      if (res.success) {
        if (res.requiresEmailConfirmation) {
          setSuccess(res.message || 'Confirma tu correo y después inicia sesión.');
          return;
        }
        setSuccess('¡Cuenta creada exitosamente! Redirigiendo...');
        setTimeout(() => {
          if (role === 'owner') {
            onNavigate('onboarding');
          } else {
            onNavigate('home');
          }
        }, 800);
      } else {
        setError(res.message || 'No fue posible completar el registro.');
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
        {/* Columna Izquierda: Información de Registro */}
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

            <div className="space-y-2.5 pt-1 sm:pt-2">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase tracking-wider">
                Alta de Usuarios en Chile
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-snug">
                Únete a la comunidad de arriendos más confiable
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Regístrate para reservar oficinas, coworkings, salas de eventos o rentabilizar tus propios inmuebles comerciales bajo la Ley N° 18.101.
              </p>
            </div>

            <div className="space-y-2.5 pt-2 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Identidad verificada para anfitriones y arrendatarios</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Firma digital de contratos válida en Chile</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Garantías protegidas y pagos seguros</span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 pt-4 mt-4 relative z-10 border-t border-slate-800/80">
            © 2026 Spotly SpA • Cumplimiento Ley 19.628
          </div>

          <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full bg-rose-600/20 blur-3xl pointer-events-none" />
        </div>

        {/* Columna Derecha: Formulario de Registro */}
        <div className="lg:col-span-7 p-5 sm:p-7 lg:p-8 flex flex-col justify-center">
          <div className="max-w-lg w-full mx-auto space-y-4">
            <div className="space-y-0.5">
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900">Crear Cuenta en Spotly</h3>
              <p className="text-xs text-slate-500">
                Completa tus datos personales para acceder a la plataforma.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">
              {/* Selector de Rol Principal */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  ¿Cómo utilizarás la plataforma?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('tenant')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      role === 'tenant'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span>Quiero Arrendar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('owner')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      role === 'owner'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Building className="w-3.5 h-3.5 shrink-0" />
                    <span>Soy Propietario</span>
                  </button>
                </div>
              </div>

              {/* Nombres y fecha de nacimiento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Nombres
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="given-name"
                    data-temp-mail-org="0"
                    value={firstNames}
                    onChange={(e) => setFirstNames(capitalizeInitial(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium !bg-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Fecha de Nacimiento
                  </label>
                  <input
                    type="date"
                    required
                    max={getAdultBirthDateLimit()}
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                  />
                  {birthDate && !isAtLeast18(birthDate) && <p className="mt-1 text-[11px] text-rose-600">Debes tener 18 años o más.</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Apellidos</label>
                  <input type="text" required autoComplete="family-name" value={surnames} onChange={(e) => setSurnames(capitalizeInitial(e.target.value))} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Género</label>
                  <select value={gender} onChange={(e) => setGender(e.target.value as UserGender)} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium">
                    <option value="femenino">Femenino</option>
                    <option value="masculino">Masculino</option>
                    <option value="no_binario">No binario</option>
                    <option value="otro">Otro</option>
                    <option value="prefiero_no_decir">Prefiero no decir</option>
                  </select>
                </div>
              </div>

              {/* RUT y Teléfono */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    RUT Chileno
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    value={rut}
                    onChange={(e) => setRut(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium !bg-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Teléfono Móvil (+56)
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="9[0-9]{8}"
                    maxLength={9}
                    required
                    autoComplete="off"
                    placeholder="912345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').replace(/^56/, '').slice(0, 9))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium !bg-none"
                  />
                </div>
              </div>

              {/* Correo Electrónico */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="text"
                  inputMode="email"
                  name="spotly_reg_contact"
                  required
                  autoComplete="off"
                  data-temp-mail-org="0"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium !bg-none"
                />
              </div>

              {/* Contraseña y Confirmar Contraseña */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Confirmar Contraseña
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Repite tu contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                  />
                </div>
              </div>

              {/* Aceptación de Términos */}
              <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 cursor-pointer"
                />
                <span className="text-[11px] text-slate-600 leading-snug">
                  Acepto los Términos y Condiciones de Uso y autorizo el tratamiento de mis datos personales según la Ley N° 19.628 de Chile.
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-2xl shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>{loading ? 'Creando cuenta...' : 'Crear Cuenta Gratis'}</span>
              </button>
            </form>

            <div className="pt-3 border-t border-slate-100 text-center text-xs text-slate-600">
              ¿Ya tienes una cuenta registrada?{' '}
              <button
                type="button"
                onClick={() => onNavigate('login')}
                className="font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
              >
                Iniciar sesión aquí
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
