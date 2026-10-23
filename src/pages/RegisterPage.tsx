import React, { useState } from 'react';
import { AuthLayout } from '../components/AuthLayout.tsx';
import { useApp } from '../context/AppContext.tsx';
import { validateRut, formatRut, capitalizeInitial } from '../utils/formatters.ts';
import { getAdultBirthDateLimit, isAtLeast18 } from '../utils/ageValidation.ts';
import { UserGender } from '../types.ts';
import { Link } from 'react-router-dom';
import {
  UserPlus,
  Mail,
  Lock,
  User,
  Phone,
  Calendar,
  Building,
  AlertCircle,
  CheckCircle2,
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
      setError('Debes marcar la casilla de aceptación antes de crear tu cuenta.');
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
            onNavigate('owner');
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
    <AuthLayout
      title="Encuentra o publica tu próximo espacio."
      description="Regístrate para explorar espacios disponibles, gestionar tus reservas o publicar un espacio como propietario."
      points={['Explora por ubicación, categoría y modalidad', 'Consulta tus solicitudes desde tu cuenta', 'Elige si quieres arrendar o publicar']}
      formTitle="Crear cuenta"
      formDescription="Completa tus datos para acceder a la plataforma."
    >

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">
              {/* Selector de Rol Principal */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
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
                    <span>Quiero arrendar</span>
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
                    <span>Soy propietario</span>
                  </button>
                </div>
              </div>

              {/* Nombres y fecha de nacimiento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">
                    Nombres
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="given-name"
                    data-temp-mail-org="0"
                    value={firstNames}
                    onChange={(e) => setFirstNames(capitalizeInitial(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-base sm:text-sm text-stone-900 placeholder:text-stone-400 transition duration-200 hover:border-stone-400 focus:border-rose-500 focus:outline-hidden focus:ring-4 focus:ring-rose-500/15 font-medium !bg-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">
                    Fecha de nacimiento
                  </label>
                  <input
                    type="date"
                    required
                    max={getAdultBirthDateLimit()}
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-base sm:text-sm text-stone-900 placeholder:text-stone-400 transition duration-200 hover:border-stone-400 focus:border-rose-500 focus:outline-hidden focus:ring-4 focus:ring-rose-500/15 font-medium"
                  />
                  {birthDate && !isAtLeast18(birthDate) && <p className="mt-1 text-[11px] text-rose-600">Debes tener 18 años o más.</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Apellidos</label>
                  <input type="text" required autoComplete="family-name" value={surnames} onChange={(e) => setSurnames(capitalizeInitial(e.target.value))} className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-base sm:text-sm text-stone-900 placeholder:text-stone-400 transition duration-200 hover:border-stone-400 focus:border-rose-500 focus:outline-hidden focus:ring-4 focus:ring-rose-500/15 font-medium" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Género</label>
                  <select value={gender} onChange={(e) => setGender(e.target.value as UserGender)} className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-base sm:text-sm text-stone-900 placeholder:text-stone-400 transition duration-200 hover:border-stone-400 focus:border-rose-500 focus:outline-hidden focus:ring-4 focus:ring-rose-500/15 font-medium">
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
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">
                    RUT chileno
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    value={rut}
                    onChange={(e) => setRut(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-base sm:text-sm text-stone-900 placeholder:text-stone-400 transition duration-200 hover:border-stone-400 focus:border-rose-500 focus:outline-hidden focus:ring-4 focus:ring-rose-500/15 font-medium !bg-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">
                    Teléfono móvil (+56)
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
                    className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-base sm:text-sm text-stone-900 placeholder:text-stone-400 transition duration-200 hover:border-stone-400 focus:border-rose-500 focus:outline-hidden focus:ring-4 focus:ring-rose-500/15 font-medium !bg-none"
                  />
                </div>
              </div>

              {/* Correo Electrónico */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Correo electrónico
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
                  className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-base sm:text-sm text-stone-900 placeholder:text-stone-400 transition duration-200 hover:border-stone-400 focus:border-rose-500 focus:outline-hidden focus:ring-4 focus:ring-rose-500/15 font-medium !bg-none"
                />
              </div>

              {/* Contraseña y Confirmar Contraseña */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-base sm:text-sm text-stone-900 placeholder:text-stone-400 transition duration-200 hover:border-stone-400 focus:border-rose-500 focus:outline-hidden focus:ring-4 focus:ring-rose-500/15 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">
                    Confirmar contraseña
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Repite tu contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-base sm:text-sm text-stone-900 placeholder:text-stone-400 transition duration-200 hover:border-stone-400 focus:border-rose-500 focus:outline-hidden focus:ring-4 focus:ring-rose-500/15 font-medium"
                  />
                </div>
              </div>

              {/* Aceptación de Términos */}
              <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  required
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 cursor-pointer"
                />
                <span className="text-[11px] text-slate-600 leading-snug">
                  Al tocar «Crear cuenta», aceptas los <Link to="/terminos" className="font-semibold text-blue-700 hover:underline">Términos y condiciones</Link> de Spotly y confirmas que has leído la <Link to="/privacidad" className="font-semibold text-blue-700 hover:underline">Política de privacidad</Link> y la <Link to="/cookies" className="font-semibold text-blue-700 hover:underline">Política de cookies</Link>.
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="shine group w-full py-3.5 bg-stone-950 hover:bg-rose-600 text-white font-semibold text-sm rounded-full shadow-[0_14px_30px_-12px_rgba(12,10,9,0.55)] transition-[background-color,transform] duration-300 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>{loading ? 'Creando cuenta...' : 'Crear cuenta gratis'}</span>
              </button>
            </form>

            <div className="pt-5 border-t border-stone-100 text-center text-sm text-stone-600">
              ¿Ya tienes una cuenta registrada?{' '}
              <button
                type="button"
                onClick={() => onNavigate('login')}
                className="font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
              >
                Iniciar sesión aquí
              </button>
            </div>
    </AuthLayout>
  );
};
