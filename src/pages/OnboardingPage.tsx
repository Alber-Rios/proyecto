import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { formatRut } from '../utils/formatters.ts';
import { DocumentScanner } from '../components/DocumentScanner.tsx';
import { RealtimeFaceScanner } from '../components/RealtimeFaceScanner.tsx';
import { verifyKycWithServer } from '../utils/verificationService.ts';
import { uploadKycDocument, uploadBiometricPhoto } from '../lib/storage.ts';

import {
  ShieldCheck,
  Camera,
  CheckCircle2,
  FileCheck2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Clock,
  Upload,
  ScanLine,
  UserCheck,
  FileText,
  Trash2,
  Check,
  Eye,
  Sparkles,
  XCircle,
  RefreshCw,
} from 'lucide-react';

interface OnboardingPageProps {
  onNavigate: (view: string) => void;
  onOpenAuth?: (mode: 'login' | 'register', notice?: string) => void;
}

export const OnboardingPage: React.FC<OnboardingPageProps> = ({ onNavigate, onOpenAuth }) => {
  const { currentUser, addAuditRecord, updateUserProfile } = useApp();

  const isRejected = currentUser?.verificationStatus === 'rejected';
  const rejectionReasonText =
    currentUser?.kycRejectionReason ||
    currentUser?.kycData?.rejectionReason ||
    'La documentación enviada presenta observaciones o requiere volver a capturarse con mayor nitidez.';

  const hasCompletedAllSteps = Boolean(
    currentUser &&
      (currentUser.verificationStatus === 'pending_review' ||
        currentUser.verificationStatus === 'rejected' ||
        (currentUser.kycData?.idFrontCaptured &&
          currentUser.kycData?.idBackCaptured &&
          currentUser.kycData?.photoCaptured &&
          currentUser.kycData?.criminalRecordSubmitted))
  );

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(() =>
    hasCompletedAllSteps ? 4 : 1
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [extractionMessage, setExtractionMessage] = useState('');

  useEffect(() => {
    if (hasCompletedAllSteps) {
      setCurrentStep(4);
    } else {
      setCurrentStep(1);
    }
  }, [currentUser?.id, currentUser?.verificationStatus]);

  // PASO 1: Cédula de Identidad
  const [idFrontPhoto, setIdFrontPhoto] = useState<string | null>(null);
  const [idBackPhoto, setIdBackPhoto] = useState<string | null>(null);
  const [scanningSide, setScanningSide] = useState<'front' | 'back' | null>(null);

  // PASO 2: Reconocimiento Facial
  const [facialPhoto, setFacialPhoto] = useState<string | null>(null);
  const [isFaceScanning, setIsFaceScanning] = useState(false);

  // PASO 3: Certificado de Antecedentes
  const [criminalRecordFile, setCriminalRecordFile] = useState<string | null>(null);
  const [criminalRecordFileName, setCriminalRecordFileName] = useState<string>('');
  const [criminalRecordFileSize, setCriminalRecordFileSize] = useState<string>('');

  const handleDocumentCaptured = (dataUrl: string, type: string) => {
    if (scanningSide === 'front') {
      setIdFrontPhoto(dataUrl);
    } else if (scanningSide === 'back') {
      setIdBackPhoto(dataUrl);
    }
    setScanningSide(null);
  };

  const handleFaceCaptured = (dataUrl: string) => {
    setFacialPhoto(dataUrl);
    setIsFaceScanning(false);
  };

  // Cargar Certificado de Antecedentes
  const handleCriminalRecordUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setError(null);
      if (file.size === 0) {
        setError('El archivo está vacío. Selecciona nuevamente el certificado.');
        e.target.value = '';
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('El certificado supera el límite de 10 MB. Selecciona un archivo más pequeño.');
        e.target.value = '';
        return;
      }
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
        setError('Formato no permitido. Adjunta el certificado en PDF, JPG o PNG.');
        e.target.value = '';
        return;
      }
      setCriminalRecordFileName(file.name);
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setCriminalRecordFileSize(`${sizeMb} MB`);
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCriminalRecordFile(ev.target?.result as string);
      };
      reader.onerror = () => setError('No se pudo leer el archivo. Intenta seleccionarlo otra vez.');
      reader.readAsDataURL(file);
    }
  };

  // CASO: Usuario no logueado
  if (!currentUser) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-lg space-y-6">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-xs">
            <ShieldCheck className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
              Verificación de Identidad
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Inicia sesión para verificar tu perfil
            </h2>
            <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              Para validar tu cédula de identidad, reconocimiento facial y antecedentes, debes iniciar sesión con tu cuenta.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => onOpenAuth?.('login', 'Inicia sesión para continuar tu verificación de identidad.')}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => onOpenAuth?.('register', 'Crea una cuenta antes de verificar tu identidad.')}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              Registrarte Gratis
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Si el usuario ya está verificado
  if (currentUser.verificationStatus === 'verified') {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-sm space-y-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-3xl flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300">
              Identidad Aprobada
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              ¡Tu cuenta ya está verificada!
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              El Administrador ya revisó y validó tus antecedentes, cédula de identidad y biometría. Puedes reservar y publicar con total normalidad.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 max-w-md mx-auto text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Titular:</span>
              <span className="font-bold text-slate-900">{currentUser.fullName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">RUT:</span>
              <span className="font-bold text-slate-900">{formatRut(currentUser.rut)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Estado:</span>
              <span className="font-bold text-emerald-700">✓ Verificado por el Administrador</span>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => onNavigate('home')}
              className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
            >
              Ir al Catálogo de Espacios
            </button>
            <button
              onClick={() => onNavigate('profile')}
              className="w-full sm:w-auto px-6 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Ver Mi Perfil
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Si el usuario ya completó todos los pasos, se muestra directamente el Paso 4 dentro de la vista de Verificación de Identidad con la barra de progreso y el mensaje de demora.

  // VALIDACIÓN PASO 1: Cédula de Identidad (Fotos requeridas)
  const handleValidateStep1 = () => {
    setError(null);
    if (!idFrontPhoto) {
      setError('Debes subir o fotografiar el frente (anverso) de tu cédula de identidad.');
      return;
    }
    if (!idBackPhoto) {
      setError('Debes subir o fotografiar el reverso (dorso) de tu cédula de identidad.');
      return;
    }

    addAuditRecord('VERIFICATION_ID_PHOTOS_UPLOADED', 'security', {
      userId: currentUser.id,
      rut: currentUser.rut,
      frontProvided: true,
      backProvided: true,
    });

    setCurrentStep(2);
  };

  // VALIDACIÓN PASO 2: Reconocimiento Facial
  const handleValidateStep2 = () => {
    setError(null);
    if (!facialPhoto) {
      setError('Debes encender la cámara y realizar el reconocimiento facial antes de continuar.');
      return;
    }

    addAuditRecord('VERIFICATION_FACE_RECOGNIZED', 'security', {
      userId: currentUser.id,
      rut: currentUser.rut,
      facialPhotoCaptured: true,
    });

    setCurrentStep(3);
  };

  // VALIDACIÓN PASO 3 Y ENVÍO FINAL: Extracción AI y Verificación Automática de Cédula y Rostro
  const handleFinalSubmit = async () => {
    setError(null);
    if (!criminalRecordFile) {
      setError('Debes subir tu Certificado de Antecedentes para Fines Especiales antes de finalizar.');
      return;
    }

    setLoading(true);
    setExtractionProgress(10);
    setExtractionMessage('Iniciando escaneo inteligente de Cédula y reconocimiento facial...');

    try {
      setExtractionProgress(30);
      setExtractionMessage('Enviando imágenes al servidor AI de verificación biométrica...');

      // Llamada real al backend Gemini 3.8 Flash Vision AI
      const kycRes = await verifyKycWithServer({
        idFrontPhoto: idFrontPhoto!,
        idBackPhoto: idBackPhoto || undefined,
        facialPhoto: facialPhoto!,
        expectedRut: currentUser.rut,
        expectedName: currentUser.fullName,
      });

      setExtractionProgress(70);
      setExtractionMessage(`Coincidencia biométrica del ${kycRes.data.faceMatchScore}%. Validando cédula...`);

      await new Promise(resolve => setTimeout(resolve, 600));

      setExtractionProgress(85);
      setExtractionMessage('Guardando copias de seguridad cifradas en Supabase Storage...');

      // Subida segura a los buckets privados de Supabase Storage
      let frontStorageUrl = idFrontPhoto;
      let backStorageUrl = idBackPhoto;
      let facialStorageUrl = facialPhoto;
      let criminalStorageUrl = criminalRecordFile;

      if (idFrontPhoto) frontStorageUrl = await uploadKycDocument(idFrontPhoto, currentUser.id, 'front');
      if (idBackPhoto) backStorageUrl = await uploadKycDocument(idBackPhoto, currentUser.id, 'back');
      if (facialPhoto) facialStorageUrl = await uploadBiometricPhoto(facialPhoto, currentUser.id);
      if (criminalRecordFile) criminalStorageUrl = await uploadKycDocument(criminalRecordFile, currentUser.id, 'criminal_record');

      setExtractionProgress(100);
      setExtractionMessage('¡Escaneo de Cédula y Reconocimiento Facial completados!');

      // Actualizar estado del usuario con los datos extraídos por la AI y enlaces a Storage
      updateUserProfile({
        verificationStatus: 'pending_review',
        kycRejectionReason: undefined,
        kycData: {
          consentGiven: true,
          termsVersion: 'VERIFICACION-2026.1',
          photoCaptured: true,
          photoUrl: facialStorageUrl || undefined,
          idFrontCaptured: true,
          idBackCaptured: true,
          idFrontUrl: frontStorageUrl || undefined,
          idBackUrl: backStorageUrl || undefined,
          rutNumber: kycRes.data.extractedRut || currentUser.rut,
          documentSerialNumber: kycRes.data.documentSerialNumber,
          criminalRecordSubmitted: true,
          criminalRecordValid: true,
          criminalRecordDocCode: criminalRecordFileName,
          criminalRecordUrl: criminalStorageUrl || undefined,
          submittedAt: new Date().toISOString(),
          rejectionReason: undefined,
          rejectedAt: undefined,
          manualReviewRequired: true,
          manualReviewNotes: `${kycRes.data.summary} (Proveedor: ${kycRes.provider})`,
        },
      });

      addAuditRecord('VERIFICATION_AI_EXTRACTION_COMPLETED', 'security', {
        userId: currentUser.id,
        rut: currentUser.rut,
        extractedRut: kycRes.data.extractedRut,
        faceMatchScore: kycRes.data.faceMatchScore,
        status: 'pending',
        provider: kycRes.provider,
        automatedVerification: true,
      });

      setCurrentStep(4);
    } catch (err: any) {
      setError(err.message || 'Error al procesar la verificación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-3 sm:py-5 space-y-6 pb-14">
      {/* Encabezado */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-bold">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-700" />
          Acreditación de Identidad • Spotly Chile
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Verificación de Identidad
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto">
          Completa los pasos requeridos. La documentación será revisada por el Administrador en un plazo aproximado de 2 días hábiles.
        </p>
      </div>

      {/* Barra de Progreso de 4 Pasos */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px] sm:text-xs font-bold">
          {[
            '1. Cédula de Identidad',
            '2. Reconocimiento Facial',
            '3. Antecedentes',
            '4. Estado de la Solicitud',
          ].map((title, idx) => (
            <div
              key={title}
              className={`p-2 rounded-xl transition ${
                currentStep === idx + 1
                  ? isRejected && idx === 3
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-slate-900 text-white shadow-xs'
                  : currentStep > idx + 1
                  ? 'bg-emerald-50 text-emerald-800 font-bold'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {title}
            </div>
          ))}
        </div>
      </div>

      {/* Banner de Aviso de Solicitud Rechazada cuando el usuario está corrigiendo los pasos 1, 2 o 3 */}
      {isRejected && currentStep !== 4 && (
        <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
              <XCircle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider text-rose-900">
                  Estado de la Solicitud: Rechazada
                </span>
              </div>
              <p className="text-xs text-rose-800 leading-relaxed">
                <strong>Motivo informado por el Administrador:</strong> "{rejectionReasonText}"
              </p>
              <p className="text-[11px] text-rose-700">
                Por favor corrige y vuelve a subir los documentos solicitados a continuación para enviar una nueva solicitud.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCurrentStep(4)}
            className="px-3.5 py-2 bg-white hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold shrink-0 cursor-pointer transition"
          >
            Ver Estado de Solicitud
          </button>
        </div>
      )}

      {/* Contenedor del Paso Activo */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        {/* ========================================================= */}
        {/* PASO 1: CÉDULA DE IDENTIDAD (AI-Powered) */}
        {/* ========================================================= */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0">
                <ScanLine className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Paso 1: Cédula de Identidad (Anverso y Reverso)
                </h3>
                <p className="text-xs text-slate-500">
                  Alinea tu cédula de identidad chilena para identificación automática y captura de alta resolución.
                </p>
              </div>
            </div>

            {scanningSide ? (
              <DocumentScanner
                side={scanningSide}
                onDocumentCaptured={handleDocumentCaptured}
                onCancel={() => setScanningSide(null)}
                title={`Escaneando ${scanningSide === 'front' ? 'Anverso' : 'Reverso'}`}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* RECUADRO 1: FRENTE / ANVERSO */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-indigo-600" />
                      Frente / Anverso
                    </span>
                    {idFrontPhoto && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" /> Identificado
                      </span>
                    )}
                  </div>

                  <div className="relative aspect-16/10 rounded-2xl overflow-hidden bg-slate-900 border-2 border-dashed border-slate-300 flex items-center justify-center group">
                    {idFrontPhoto ? (
                      <img src={idFrontPhoto} className="w-full h-full object-cover" alt="Front" />
                    ) : (
                      <button
                        onClick={() => setScanningSide('front')}
                        className="w-full h-full flex flex-col items-center justify-center gap-2 hover:bg-slate-800/40 transition group cursor-pointer"
                      >
                        <Camera className="w-8 h-8 text-slate-500 group-hover:text-indigo-400 transition" />
                        <span className="text-[11px] font-bold text-slate-400 group-hover:text-slate-200">Iniciar Escaneo Anverso</span>
                      </button>
                    )}
                  </div>

                  {idFrontPhoto && (
                    <button
                      onClick={() => setIdFrontPhoto(null)}
                      className="w-full py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    >
                      Eliminar y Volver a Escanear
                    </button>
                  )}
                </div>

                {/* RECUADRO 2: REVERSO / DORSO */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <ScanLine className="w-4 h-4 text-indigo-600" />
                      Reverso / Dorso
                    </span>
                    {idBackPhoto && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" /> Identificado
                      </span>
                    )}
                  </div>

                  <div className="relative aspect-16/10 rounded-2xl overflow-hidden bg-slate-900 border-2 border-dashed border-slate-300 flex items-center justify-center group">
                    {idBackPhoto ? (
                      <img src={idBackPhoto} className="w-full h-full object-cover" alt="Back" />
                    ) : (
                      <button
                        onClick={() => setScanningSide('back')}
                        className="w-full h-full flex flex-col items-center justify-center gap-2 hover:bg-slate-800/40 transition group cursor-pointer"
                      >
                        <Camera className="w-8 h-8 text-slate-500 group-hover:text-indigo-400 transition" />
                        <span className="text-[11px] font-bold text-slate-400 group-hover:text-slate-200">Iniciar Escaneo Reverso</span>
                      </button>
                    )}
                  </div>

                  {idBackPhoto && (
                    <button
                      onClick={() => setIdBackPhoto(null)}
                      className="w-full py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    >
                      Eliminar y Volver a Escanear
                    </button>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!scanningSide && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                  Identificación automática con tecnología AI Spotly
                </span>
                <button
                  type="button"
                  onClick={handleValidateStep1}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <span>Continuar a Reconocimiento Facial</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* PASO 2: RECONOCIMIENTO FACIAL (Selfie Simple) */}
        {/* ========================================================= */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Paso 2: Reconocimiento Facial Biométrico
                </h3>
                <p className="text-xs text-slate-500">
                  Tómate una selfie simple. El sistema reconocerá tus facciones automáticamente sin pedirte movimientos complejos.
                </p>
              </div>
            </div>

            {isFaceScanning ? (
              <RealtimeFaceScanner
                onFaceCaptured={handleFaceCaptured}
                onCancel={() => setIsFaceScanning(false)}
                title="Captura de Selfie Biométrica"
              />
            ) : (
              <div className="max-w-md mx-auto space-y-4">
                <div className="relative aspect-square rounded-3xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-xl flex items-center justify-center">
                  {facialPhoto ? (
                    <img src={facialPhoto} className="w-full h-full object-cover" alt="Selfie" />
                  ) : (
                    <div className="text-center p-8 space-y-4">
                      <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mx-auto border border-slate-800 text-indigo-400">
                        <Camera className="w-8 h-8" />
                      </div>
                      <p className="text-xs text-slate-400">Tu selfie aparecerá aquí tras la captura.</p>
                    </div>
                  )}
                </div>

                {!facialPhoto && (
                  <button
                    onClick={() => setIsFaceScanning(true)}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Camera className="w-5 h-5" />
                    Iniciar Reconocimiento Facial
                  </button>
                )}

                {facialPhoto && (
                  <button
                    onClick={() => setFacialPhoto(null)}
                    className="w-full py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                  >
                    Eliminar y Volver a Capturar
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!isFaceScanning && (
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Volver a Cédula
                </button>
                <button
                  type="button"
                  onClick={handleValidateStep2}
                  disabled={!facialPhoto}
                  className={`px-6 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs ${
                    facialPhoto
                      ? 'bg-slate-900 hover:bg-black text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <span>Continuar a Antecedentes</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* PASO 3: CERTIFICADO DE ANTECEDENTES (Solo subir el certificado) */}
        {/* ========================================================= */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Paso 3: Certificado de Antecedentes para Fines Especiales
                </h3>
                <p className="text-xs text-slate-500">
                  Sube únicamente tu Certificado de Antecedentes emitido por el Servicio de Registro Civil e Identificación de Chile.
                </p>
              </div>
            </div>

            {/* Recuadro de Carga del Certificado */}
            <div className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-amber-300 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-xs">
                <FileText className="w-7 h-7" />
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  {criminalRecordFileName ? `Archivo: ${criminalRecordFileName}` : 'Subir Certificado de Antecedentes'}
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Formatos aceptados: PDF, JPG, PNG (máx. 10MB)
                </p>
                {criminalRecordFileSize && (
                  <p className="text-[11px] font-mono text-emerald-700 font-bold mt-1">
                    Tamaño: {criminalRecordFileSize} • Documento cargado
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center gap-3">
                <label className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer transition flex items-center gap-2 shadow-xs">
                  <Upload className="w-4 h-4" />
                  <span>{criminalRecordFile ? 'Cambiar Documento' : 'Seleccionar Certificado'}</span>
                  <input
                    type="file"
                    accept=".pdf,image/jpeg,image/png"
                    className="hidden"
                    onChange={handleCriminalRecordUpload}
                  />
                </label>

                {criminalRecordFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setCriminalRecordFile(null);
                      setCriminalRecordFileName('');
                      setCriminalRecordFileSize('');
                    }}
                    className="px-3 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold transition cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>

            {/* Nota de verificación por el administrador */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="font-bold text-slate-800">📌 Información importante sobre la revisión:</div>
              <p>
                Al enviar este documento, tu expediente pasará a la bandeja del <strong>Administrador</strong>, quien revisará manualmente la autenticidad del certificado, tu carnet y el reconocimiento facial.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {loading && (
              <div className="space-y-3 p-6 bg-slate-50 rounded-2xl border border-slate-200 animate-in fade-in zoom-in duration-300">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                    {extractionMessage}
                  </span>
                  <span>{extractionProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 transition-all duration-500 ease-out"
                    style={{ width: `${extractionProgress}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 text-center italic">
                  No cierres esta ventana mientras procesamos tus documentos con AI Spotly.
                </p>
              </div>
            )}

            {!loading && (
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Volver a Reconocimiento
                </button>
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={loading || !criminalRecordFile}
                  className={`px-6 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs ${
                    criminalRecordFile
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <span>Finalizar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* PASO 4: ESTADO DE LA SOLICITUD (EN REVISIÓN O RECHAZADA CON MOTIVO) */}
        {/* ========================================================= */}
        {currentStep === 4 && (
          isRejected ? (
            <div className="space-y-6 text-center py-4">
              {/* Ícono de Rechazo */}
              <div className="w-20 h-20 rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-sm ring-4 ring-rose-50">
                <XCircle className="w-10 h-10" />
              </div>

              {/* Títulos de Estado Rechazado */}
              <div className="space-y-2 max-w-xl mx-auto">
                <span className="px-3.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300 uppercase tracking-wider">
                  Estado de la Solicitud: Rechazada
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
                  Tu solicitud de verificación fue rechazada
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  El <strong>Administrador de Spotly</strong> revisó tu expediente de identidad y registró una observación que impide aprobar tu verificación actual.
                </p>
              </div>

              {/* Cuadro Principal con el Porqué / Motivo del Rechazo */}
              <div className="bg-rose-50/90 rounded-3xl p-5 sm:p-6 border-2 border-rose-200 max-w-lg mx-auto text-left space-y-4 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-rose-200/80">
                  <span className="text-rose-950 font-black text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    ¿Por qué fue rechazada tu solicitud?
                  </span>
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-rose-600 text-white uppercase">
                    Rechazada
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-rose-200 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 block">
                    Motivo informado por el Administrador:
                  </span>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 leading-relaxed">
                    "{rejectionReasonText}"
                  </p>
                </div>

                <div className="space-y-2 text-xs text-slate-700 pt-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Titular Solicitante:</span>
                    <span className="font-bold text-slate-900">{currentUser.fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">RUT Oficial:</span>
                    <span className="font-bold text-slate-900">{formatRut(currentUser.rut)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Estado Actual:</span>
                    <span className="font-bold text-rose-700">✗ Solicitud Rechazada (Requiere corrección)</span>
                  </div>
                  {currentUser.kycData?.rejectedAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Fecha de Revisión:</span>
                      <span className="font-semibold text-slate-800">
                        {new Date(currentUser.kycData.rejectedAt).toLocaleDateString('es-CL')}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-white/80 rounded-2xl border border-rose-200 text-[11px] text-rose-900 leading-relaxed">
                  📌 <strong>¿Qué debes hacer ahora?:</strong> Haz clic en el botón de abajo para volver al Paso 1, corregir la observación indicada por el Administrador y enviar nuevamente tu solicitud para revisión.
                </div>
              </div>

              {/* Botones de Acción para Reintentar */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setCurrentStep(1);
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Corregir Documentos y Enviar Nuevamente</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 text-center py-4">
              {/* Ícono de reloj y estado */}
              <div className="w-20 h-20 rounded-3xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-sm">
                <Clock className="w-10 h-10 animate-pulse" />
              </div>

              {/* Títulos y mensaje solicitado */}
              <div className="space-y-2 max-w-xl mx-auto">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 uppercase tracking-wider">
                  Expediente Enviado con Éxito
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
                  Tu verificación demorará aproximadamente 2 días
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Hemos recibido tu documentación. <strong>Esta verificación es revisada minuciosamente por el Administrador</strong> de Spotly para cotejar tus fotos de carnet, reconocimiento facial y certificado de antecedentes.
                </p>
              </div>

              {/* Ficha Resumen de lo Enviado */}
              <div className="bg-slate-50 rounded-3xl p-5 border border-slate-200 max-w-lg mx-auto text-left text-xs space-y-3 shadow-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-slate-900 font-bold text-sm flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    Detalle del Expediente de Verificación
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                    En Revisión
                  </span>
                </div>

                <div className="space-y-2.5 text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Titular Solicitante:</span>
                    <span className="font-bold text-slate-900">{currentUser.fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">RUT Oficial:</span>
                    <span className="font-bold text-slate-900">{formatRut(currentUser.rut)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cédula de Identidad:</span>
                    <span className="font-bold text-emerald-700">✓ Anverso y Reverso Adjuntos</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Reconocimiento Facial:</span>
                    <span className="font-bold text-emerald-700">✓ Rostro Reconocido en Vivo</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Certificado de Antecedentes:</span>
                    <span className="font-bold text-emerald-700">
                      ✓ {criminalRecordFileName || currentUser.kycData?.criminalRecordDocCode || 'Documento Adjunto'}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2">
                    <span className="text-slate-500">¿Quién revisa esto?:</span>
                    <span className="font-bold text-indigo-900">El Administrador de la plataforma</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tiempo de Respuesta:</span>
                    <span className="font-bold text-amber-900">Aprox. 2 días hábiles</span>
                  </div>
                </div>

                <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                  💡 <strong>Información para el usuario:</strong> Mientras el Administrador valida tu expediente, puedes explorar todos los espacios, ubicaciones y precios en Spotly. Una vez aprobada tu cuenta, podrás formalizar contratos y publicar propiedades.
                </div>
              </div>

              {/* Botones de navegación */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('home')}
                  className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Explorar Catálogo de Espacios
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="w-full sm:w-auto px-6 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Actualizar Documentación
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};
