import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { UserGender } from '../types.ts';
import { formatRut, validateRut } from '../utils/formatters.ts';
import {
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Phone,
  Mail,
  Edit3,
  Save,
  Clock,
  Sparkles,
  Building,
} from 'lucide-react';

interface ProfilePageProps {
  onNavigate: (view: string) => void;
  onOpenOwnerUpgrade: () => void;
  onOpenAuth?: (mode: 'login' | 'register', notice?: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  onNavigate,
  onOpenOwnerUpgrade,
  onOpenAuth,
}) => {
  const {
    currentUser,
    updateUserProfile,
  } = useApp();

  // Formulario de edición de datos personales
  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [rut, setRut] = useState(currentUser?.rut || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [phone, setPhone] = useState(currentUser?.phone || '+56 9 ');
  const [gender, setGender] = useState<UserGender>(currentUser?.gender || 'prefiero_no_decir');
  const [birthDate, setBirthDate] = useState(currentUser?.birthDate || '');
  const [commune, setCommune] = useState(currentUser?.commune || '');

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Si no está registrado/autenticado
  if (!currentUser) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-lg space-y-6">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto shadow-xs">
            <User className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
              Mi Cuenta Spotly
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Inicia sesión para gestionar tu cuenta
            </h2>
            <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              Accede a tus datos personales, actualiza tu información de contacto, revisa el estado de tus reservas y consulta tus notificaciones oficiales.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => onOpenAuth?.('login', 'Inicia sesión para acceder a tu perfil y datos.')}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => onOpenAuth?.('register', 'Crea una cuenta en Spotly Chile.')}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
            >
              Registrarte Gratis
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Manejo de actualización de perfil
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaveSuccess(false);

    if (!fullName.trim()) {
      setFormError('El nombre completo es obligatorio.');
      return;
    }

    if (!validateRut(rut)) {
      setFormError('El RUT ingresado no es válido según el algoritmo Módulo 11 de Chile.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setFormError('Ingresa un correo electrónico válido.');
      return;
    }

    updateUserProfile({
      fullName: fullName.trim(),
      rut: rut.trim(),
      email: email.trim(),
      phone: phone.trim(),
      gender,
      birthDate,
      commune: commune.trim(),
    });

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 4000);
  };

  // Calcular edad actual
  const userAge = useMemo(() => {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }, [birthDate]);

  return (
    <div className="max-w-5xl mx-auto py-3 sm:py-5 space-y-6 pb-16">
      {/* TARJETA CABECERA DE PERFIL */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-5 sm:p-8 shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div aria-hidden="true" className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-slate-100 ring-4 ring-rose-100 shadow-md" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                  {currentUser.fullName}
                </h1>
                {currentUser.verificationStatus === 'verified' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Identidad Verificada
                  </span>
                ) : currentUser.verificationStatus === 'pending_review' ? (
                  <button
                    onClick={() => onNavigate('onboarding')}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 transition cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-700" />
                    Revisión Pendiente por Admin (~2 días)
                  </button>
                ) : currentUser.verificationStatus === 'rejected' ? (
                  <button
                    onClick={() => onNavigate('onboarding')}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200 transition cursor-pointer"
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                    Solicitud de Verificación Rechazada
                  </button>
                ) : null}
              </div>

              <p className="text-xs text-slate-500 font-mono">
                RUT: <strong className="text-slate-800">{formatRut(currentUser.rut)}</strong> • {currentUser.email}
              </p>

              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700">
                  Rol: {currentUser.role === 'admin' ? 'Administrador' : currentUser.role === 'owner' ? 'Propietario' : 'Arrendatario'}
                </span>
                {currentUser.role === 'admin' ? (
                  <button
                    onClick={() => onNavigate('admin')}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition flex items-center gap-1 cursor-pointer"
                  >
                    <ShieldCheck className="w-3 h-3 text-indigo-200" />
                    Ir al Panel Administrador
                  </button>
                ) : currentUser.role === 'owner' || currentUser.ownerTermsAccepted ? (
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-100 text-purple-800">
                      ✓ Anfitrión Habilitado
                    </span>
                    <button
                      onClick={() => onNavigate('owner')}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-900 hover:bg-black text-white transition flex items-center gap-1 cursor-pointer"
                    >
                      <Building className="w-3 h-3 text-amber-400" />
                      Panel Propietario
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={onOpenOwnerUpgrade}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-rose-50 to-amber-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    Habilitarme como Anfitrión
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex sm:flex-col items-center sm:items-end gap-2 w-full sm:w-auto justify-between border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
            <span className="text-[11px] text-slate-400">
              Miembro desde {new Date(currentUser.createdAt || Date.now()).toLocaleDateString('es-CL')}
            </span>
            <button
              onClick={() => onNavigate(currentUser.role === 'admin' ? 'admin' : 'home')}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Building className="w-3.5 h-3.5 text-slate-500" />
              {currentUser.role === 'admin' ? 'Volver al Panel Admin' : 'Explorar Espacios'}
            </button>
          </div>
        </div>
      </div>

      {/* SECCIÓN PRINCIPAL: MIS DATOS PERSONALES */}
      <div className="space-y-6">
          {/* BANNER DE ESTADO DE VERIFICACIÓN (Solo para usuarios no administradores) */}
          {currentUser.role !== 'admin' && currentUser.verificationStatus !== 'verified' && (
            <div className={`p-5 rounded-3xl border flex flex-col sm:flex-row items-center gap-5 shadow-xs animate-in slide-in-from-top duration-500 ${
              currentUser.verificationStatus === 'rejected'
                ? 'bg-rose-50 border-rose-200'
                : currentUser.verificationStatus === 'pending_review'
                ? 'bg-amber-50 border-amber-200' 
                : 'bg-indigo-50 border-indigo-200'
            }`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                currentUser.verificationStatus === 'rejected'
                  ? 'bg-rose-100 text-rose-700'
                  : currentUser.verificationStatus === 'pending_review'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-indigo-100 text-indigo-700'
              }`}>
                {currentUser.verificationStatus === 'rejected' ? (
                  <AlertCircle className="w-7 h-7" />
                ) : currentUser.verificationStatus === 'pending_review' ? (
                  <Clock className="w-7 h-7" />
                ) : (
                  <ShieldCheck className="w-7 h-7" />
                )}
              </div>
              <div className="flex-1 text-center sm:text-left space-y-1">
                <h3 className={`text-sm font-black ${
                  currentUser.verificationStatus === 'rejected'
                    ? 'text-rose-950'
                    : currentUser.verificationStatus === 'pending_review'
                    ? 'text-amber-950'
                    : 'text-indigo-950'
                }`}>
                  {currentUser.verificationStatus === 'rejected'
                    ? 'Estado de la Solicitud: Verificación de Identidad Rechazada'
                    : currentUser.verificationStatus === 'pending_review'
                    ? 'Tu verificación está en proceso'
                    : 'Mejora tu seguridad: Verifica tu Identidad'}
                </h3>
                <p className={`text-xs leading-relaxed ${
                  currentUser.verificationStatus === 'rejected'
                    ? 'text-rose-800'
                    : currentUser.verificationStatus === 'pending_review'
                    ? 'text-amber-800'
                    : 'text-indigo-800'
                }`}>
                  {currentUser.verificationStatus === 'rejected' ? (
                    <>
                      <strong>Motivo del rechazo:</strong> "
                      {currentUser.kycRejectionReason ||
                        currentUser.kycData?.rejectionReason ||
                        'La documentación enviada presenta observaciones o no es legible. Por favor vuelve a subir tus documentos.'}
                      "
                    </>
                  ) : currentUser.verificationStatus === 'pending_review' ? (
                    'Nuestro equipo está revisando tus documentos. Este proceso suele tardar menos de 48 horas hábiles.'
                  ) : (
                    'Para emitir contratos legales y procesar pagos en Spotly, debes completar el escaneo inteligente de tu cédula.'
                  )}
                </p>
              </div>
              <button
                onClick={() => onNavigate('onboarding')}
                className={`px-6 py-2.5 text-white rounded-xl text-xs font-bold transition shadow-sm whitespace-nowrap cursor-pointer ${
                  currentUser.verificationStatus === 'rejected'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : currentUser.verificationStatus === 'pending_review'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20'
                }`}
              >
                {currentUser.verificationStatus === 'rejected'
                  ? 'Ver Motivo y Reintentar'
                  : currentUser.verificationStatus === 'pending_review'
                  ? 'Ver Estado de Verificación'
                  : 'Verificar Ahora'}
              </button>
            </div>
          )}

          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-rose-600" />
                Actualizar Información de Mi Cuenta
              </h2>
              <p className="text-xs text-slate-500">
                Mantén tus datos al día para la firma fehaciente de contratos digitales Ley N° 18.101.
              </p>
            </div>
            {userAge !== null && (
              <span className="text-xs font-semibold px-3 py-1 bg-slate-100 text-slate-700 rounded-full">
                Edad calculada: <strong>{userAge} años</strong>
              </span>
            )}
          </div>

          {saveSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-medium flex items-center gap-3 animate-fadeIn">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="font-bold">¡Datos actualizados con éxito!</p>
                <p className="text-[11px] text-emerald-700">Tu información de contacto y perfil han quedado sincronizados en Spotly.</p>
              </div>
            </div>
          )}

          {formError && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  RUT Chileno (con guión)
                </label>
                <input
                  type="text"
                  value={rut}
                  onChange={(e) => setRut(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Teléfono Móvil (+56 9 ...)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Género
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as UserGender)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                >
                  <option value="femenino">Femenino</option>
                  <option value="masculino">Masculino</option>
                  <option value="no_binario">No binario</option>
                  <option value="otro">Otro</option>
                  <option value="prefiero_no_decir">Prefiero no decir</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Fecha de Nacimiento
                </label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Comuna de Residencia
                </label>
                <input
                  type="text"
                  value={commune}
                  onChange={(e) => setCommune(e.target.value)}
                  placeholder="ej. Las Condes, Providencia, etc."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                />
              </div>

            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="submit"
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs"
              >
                <Save className="w-4 h-4" />
                Guardar Cambios de Mi Cuenta
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
