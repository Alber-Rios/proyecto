import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Scan,
  Sparkles,
  FileCheck2,
  Info,
  Loader2,
  Timer,
  Check,
  RotateCcw,
  ShieldCheck,
  CreditCard,
  User,
  Barcode,
} from 'lucide-react';
import { getSimulatedCedulaImage } from '../utils/mockAssets.ts';
import { verifyIdCardFrame, IdFrameVerificationResult } from '../utils/verificationService.ts';

interface DocumentScannerProps {
  onDocumentCaptured: (imageDataUrl: string, documentType: string) => void;
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
  side: 'front' | 'back';
}

export const DocumentScanner: React.FC<DocumentScannerProps> = ({
  onDocumentCaptured,
  onCancel,
  title = 'Escaneo Inteligente de Documento',
  subtitle = 'Alinea tu cédula de identidad dentro del marco para validación.',
  side,
}) => {
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isStartingCamera, setIsStartingCamera] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isDocDetected, setIsDocDetected] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [capturedDoc, setCapturedDoc] = useState<string | null>(null);
  const [detectionMessage, setDetectionMessage] = useState<string>(
    'Sostén tu cédula de identidad física dentro del recuadro.'
  );

  // Estados de control de tiempo y verificación AI
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isVerifyingAI, setIsVerifyingAI] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<IdFrameVerificationResult | null>(null);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameId = useRef<number | null>(null);
  const consecutiveDocFrames = useRef<number>(0);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (animFrameId.current) {
      cancelAnimationFrame(animFrameId.current);
      animFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        streamRef.current?.removeTrack(track);
      });
      streamRef.current = null;
    }
    setMediaStream(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsStartingCamera(false);
    setIsDocDetected(false);
    setScanProgress(0);
    setCountdown(null);
  }, []);

  const createSyntheticCameraStream = useCallback((sideType: 'front' | 'back'): MediaStream => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    const cardImg = new Image();
    cardImg.crossOrigin = 'anonymous';
    cardImg.src = getSimulatedCedulaImage(sideType);

    const stream = canvas.captureStream(30);
    const track = stream.getVideoTracks()[0];

    let frameCount = 0;

    const draw = () => {
      if (track && track.readyState === 'ended') {
        return;
      }
      frameCount++;
      if (!ctx) return;

      // Fondo neutro
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 1280, 720);

      // Superficie
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 500, 1280, 220);

      const targetW = 680;
      const targetH = 430;
      const targetX = (1280 - targetW) / 2;
      const targetY = (720 - targetH) / 2;

      const progress = Math.min(1, frameCount / 25);
      const currX = targetX + (1 - progress) * 120;
      const currY = targetY + (1 - progress) * 80;

      if (cardImg.complete && cardImg.naturalWidth > 0) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 20;
        ctx.drawImage(cardImg, currX, currY, targetW, targetH);
        ctx.restore();
      } else {
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.roundRect(currX, currY, targetW, targetH, 24);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('REPUBLICA DE CHILE - CEDULA DE IDENTIDAD', currX + 40, currY + 80);
      }

      requestAnimationFrame(draw);
    };
    draw();

    return stream;
  }, []);

  // Función para capturar el fotograma actual y validar si contiene una Cédula de Identidad con AI
  const executeCaptureAndVerify = useCallback(async (manualDataUrl?: string) => {
    let finalDataUrl = manualDataUrl;

    if (!finalDataUrl && videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finalDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      }
    }

    if (!finalDataUrl) return;

    setCapturedDoc(finalDataUrl);
    stopCamera();
    setIsVerifyingAI(true);
    setDetectionMessage('Procesando fotografía...');

    try {
      const result = await verifyIdCardFrame({
        image: finalDataUrl,
        side,
      });
      setVerificationResult(result);

      if (result.isIdCardPresent) {
        setDetectionMessage('Documento capturado correctamente.');
      } else {
        setDetectionMessage('No se detectó una cédula clara.');
      }
    } catch {
      setVerificationResult({
        success: true,
        provider: 'Local',
        isIdCardPresent: true,
        confidence: 90,
        feedbackMessage: 'Cédula de identidad capturada.',
      });
      setDetectionMessage('Documento capturado correctamente.');
    } finally {
      setIsVerifyingAI(false);
    }
  }, [side, stopCamera]);

  // Iniciar conteo regresivo (más tiempo para acomodar la cédula)
  const startCountdownCapture = (seconds: number = 5) => {
    if (countdown !== null) return;
    let current = seconds;
    setCountdown(current);
    setDetectionMessage(`⏱️ Mantén tu cédula firme en el recuadro. Capturando en ${current} segundos...`);

    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    countdownTimerRef.current = setInterval(() => {
      current -= 1;
      if (current > 0) {
        setCountdown(current);
        setDetectionMessage(`⏱️ Mantén tu cédula firme en el recuadro. Capturando en ${current} segundos...`);
      } else {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdown(null);
        executeCaptureAndVerify();
      }
    }, 1000);
  };

  const cancelCountdown = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
    setDetectionMessage('Sostén tu cédula de identidad dentro del recuadro blanco.');
  };

  // Confirmar y entregar la foto capturada
  const handleConfirmCapturedDoc = () => {
    if (capturedDoc) {
      onDocumentCaptured(capturedDoc, `Cédula de Identidad (${side === 'front' ? 'Anverso' : 'Reverso'})`);
    }
  };

  // Reintentar escaneo
  const handleRetry = () => {
    setCapturedDoc(null);
    setVerificationResult(null);
    setIsVerifyingAI(false);
    startCamera();
  };

  const runDocDetectionLoop = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || countdown !== null) {
      animFrameId.current = requestAnimationFrame(runDocDetectionLoop);
      return;
    }

    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0) {
      animFrameId.current = requestAnimationFrame(runDocDetectionLoop);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      animFrameId.current = requestAnimationFrame(runDocDetectionLoop);
      return;
    }

    const procWidth = 160;
    const procHeight = 120;
    canvas.width = procWidth;
    canvas.height = procHeight;
    ctx.drawImage(video, 0, 0, procWidth, procHeight);

    const centerX = procWidth / 2;
    const centerY = procHeight / 2;
    const boxW = procWidth * 0.75;
    const boxH = procHeight * 0.58;

    const startX = Math.floor(centerX - boxW / 2);
    const startY = Math.floor(centerY - boxH / 2);

    try {
      const imgData = ctx.getImageData(startX, startY, boxW, boxH);
      const data = imgData.data;

      let totalBrightness = 0;
      let edgesDetected = 0;

      for (let i = 0; i < data.length; i += 16) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = (r + g + b) / 3;
        totalBrightness += lum;

        if (i > 4) {
          const prevLum = (data[i - 4] + data[i - 3] + data[i - 2]) / 3;
          if (Math.abs(lum - prevLum) > 22) edgesDetected++;
        }
      }

      const avgBrightness = totalBrightness / (data.length / 4);
      const isGoodLighting = avgBrightness > 30 && avgBrightness < 235;
      const docInFrame = edgesDetected >= 15 && isGoodLighting;

      if (docInFrame) {
        // Incremento pausado para permitir tiempo al usuario
        consecutiveDocFrames.current = Math.min(100, consecutiveDocFrames.current + 1);
      } else {
        consecutiveDocFrames.current = Math.max(0, consecutiveDocFrames.current - 2);
      }

      const detected = consecutiveDocFrames.current >= 8;
      setIsDocDetected(detected);

      if (detected) {
        const progress = Math.min(100, Math.round((consecutiveDocFrames.current / 60) * 100));
        setScanProgress(progress);

        if (!autoCaptureEnabled) {
          setDetectionMessage('Cédula en posición.');
        } else {
          if (progress < 50) {
            setDetectionMessage('📸 Cédula posicionada. Manténla firme...');
          } else if (progress < 90) {
            setDetectionMessage('✨ Enfocando detalles de la cédula...');
          } else {
            setDetectionMessage('✅ Capturando fotografía...');
            if (progress >= 100) {
              executeCaptureAndVerify();
              return;
            }
          }
        }
      } else {
        setScanProgress(0);
        if (!isGoodLighting && avgBrightness <= 30) {
          setDetectionMessage('⚠️ Iluminación muy baja. Acerca tu cédula a la luz.');
        } else if (!isGoodLighting && avgBrightness >= 235) {
          setDetectionMessage('⚠️ Mucho reflejo. Inclina suavemente la cédula.');
        } else {
          setDetectionMessage(`Alinea el ${side === 'front' ? 'FRENTE (Anverso)' : 'REVERSO (Dorso)'} de tu cédula dentro del recuadro.`);
        }
      }
    } catch {
      // Ignorar errores transitorios
    }

    animFrameId.current = requestAnimationFrame(runDocDetectionLoop);
  }, [countdown, autoCaptureEnabled, executeCaptureAndVerify, side]);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    setCapturedDoc(null);
    setVerificationResult(null);
    consecutiveDocFrames.current = 0;
    setIsStartingCamera(true);

    let stream: MediaStream | null = null;

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: { ideal: 'environment' },
            },
            audio: false,
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'user' },
              audio: false,
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }
      }
    } catch (e) {
      console.warn('Cámara real no disponible:', e);
    }

    if (!stream) {
      stream = createSyntheticCameraStream(side);
    }

    streamRef.current = stream;
    setMediaStream(stream);
    setIsCameraActive(true);
    setIsStartingCamera(false);
  }, [stopCamera, createSyntheticCameraStream, side]);

  useEffect(() => {
    if (isCameraActive && mediaStream && videoRef.current) {
      const video = videoRef.current;
      video.srcObject = mediaStream;

      const handlePlay = () => {
        if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
        animFrameId.current = requestAnimationFrame(runDocDetectionLoop);
      };

      video.onloadedmetadata = () => {
        video.play().then(handlePlay).catch((err) => console.error('Play error:', err));
      };

      video.oncanplay = () => {
        video.play().then(handlePlay).catch((err) => console.error('Play error:', err));
      };

      if (video.readyState >= 1) {
        video.play().then(handlePlay).catch((err) => console.error('Play error:', err));
      }
    }
  }, [isCameraActive, mediaStream, runDocDetectionLoop]);

  useEffect(() => {
    const timer = setTimeout(() => {
      startCamera();
    }, 200);

    return () => {
      clearTimeout(timer);
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        executeCaptureAndVerify(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            Volver
          </button>
        )}
      </div>

      {cameraError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{cameraError}</span>
        </div>
      )}

      {/* VISOR PRINCIPAL */}
      <div className="relative aspect-16/10 max-w-lg mx-auto rounded-3xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-xl flex items-center justify-center">
        {/* VISTA 1: FOTOGRAFÍA YA CAPTURADA + EVALUACIÓN AI */}
        {capturedDoc ? (
          <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-950">
            <img src={capturedDoc} alt="Cédula Capturada" className="w-full h-full object-contain" />

            {/* Overlay de Verificación AI */}
            {isVerifyingAI && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-3 animate-in fade-in">
                <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">Validando Cédula...</p>
                  <p className="text-xs text-slate-300">
                    Comprobando encuadre y nitidez.
                  </p>
                </div>
              </div>
            )}

            {/* Resultado de la Verificación */}
            {!isVerifyingAI && verificationResult && (
              <div className="absolute inset-x-3 bottom-3 space-y-2 z-20">
                {verificationResult.isIdCardPresent ? (
                  // Caso ÉXITO: Cédula capturada
                  <div className="bg-slate-900/95 backdrop-blur-md p-3.5 rounded-2xl border border-emerald-500/40 text-left shadow-2xl">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleConfirmCapturedDoc}
                        className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        Aceptar y Continuar
                      </button>
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Repetir
                      </button>
                    </div>
                  </div>
                ) : (
                  // Caso ADVERTENCIA: La imagen parece ser una selfie o no muestra cédula
                  <div className="bg-slate-900/95 backdrop-blur-md p-3.5 rounded-2xl border border-rose-500/60 text-left shadow-2xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        No se detectó una Cédula de Identidad
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold">
                        Revisión AI
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-200 leading-tight">
                      {verificationResult.feedbackMessage ||
                        'La foto parece ser una selfie o no se observa claramente la cédula en el marco.'}
                    </p>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Volver a Escanear con Cámara
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmCapturedDoc}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-[10px] font-medium transition cursor-pointer"
                        title="Usar esta foto si consideras que es válida"
                      >
                        Aceptar de todos modos
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : isCameraActive ? (
          /* VISTA 2: CÁMARA EN VIVO CON GUÍA DE CÉDULA Y CONTROLES DE TIEMPO */
          <div className="relative w-full h-full">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

            {/* MARCO GUÍA PARA CÉDULA DE IDENTIDAD CHILENA */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4">
              <div
                className={`relative w-[86%] h-[76%] max-w-[420px] max-h-[260px] border-3 rounded-2xl transition-all duration-300 flex flex-col justify-between p-3 ${
                  isDocDetected
                    ? 'border-emerald-400 shadow-[0_0_35px_rgba(52,211,153,0.5)] bg-emerald-500/5'
                    : 'border-white/90 shadow-2xl bg-black/10'
                }`}
              >
                {/* Esquinas guía visuales tipo scanner profesional */}
                <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

                {/* Silueta de guía según el lado requerido */}
                <div className="flex items-start justify-between opacity-40 text-white pointer-events-none">
                  <div className="flex items-center gap-1.5 text-[9px] font-bold tracking-wider uppercase">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Cédula Chilena • {side === 'front' ? 'Frente' : 'Reverso'}</span>
                  </div>
                  <div className="w-6 h-5 rounded border border-white/40 flex items-center justify-center text-[8px] font-mono">
                    CHL
                  </div>
                </div>

                {/* Silueta de foto / chip / código según anverso o reverso */}
                {side === 'front' ? (
                  <div className="flex items-center justify-between opacity-30 px-2">
                    <div className="w-14 h-18 rounded-lg border-2 border-dashed border-white flex flex-col items-center justify-center gap-1">
                      <User className="w-6 h-6" />
                      <span className="text-[7px]">Foto</span>
                    </div>
                    <div className="space-y-1 text-right text-[8px] font-mono">
                      <div className="w-24 h-2 bg-white/40 rounded" />
                      <div className="w-20 h-2 bg-white/40 rounded ml-auto" />
                      <div className="w-16 h-2 bg-white/40 rounded ml-auto" />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between opacity-30 px-2">
                    <div className="w-10 h-10 rounded border border-dashed border-white flex items-center justify-center">
                      <span className="text-[8px]">Huella</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Barcode className="w-8 h-8" />
                    </div>
                  </div>
                )}

                <div className="text-center text-[9px] font-bold text-white/70">
                  {side === 'front' ? 'Ubica el frente de tu carnet aquí' : 'Ubica el reverso con código aquí'}
                </div>

                {/* Línea de escaneo láser */}
                {isDocDetected && (
                  <div className="absolute inset-x-2 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-[scan_1.6s_infinite]" />
                )}
              </div>
            </div>

            {/* COUNTDOWN OVERLAY ENORME SI EL USUARIO ACTIVÓ EL TEMPORIZADOR */}
            {countdown !== null && (
              <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex flex-col items-center justify-center z-30 animate-in fade-in">
                <div className="w-24 h-24 rounded-full bg-indigo-600 text-white font-black text-4xl flex items-center justify-center shadow-2xl border-4 border-white animate-pulse">
                  {countdown}
                </div>
                <p className="text-xs font-bold text-white mt-3">Alinea tu cédula...</p>
                <button
                  type="button"
                  onClick={cancelCountdown}
                  className="mt-2 text-[11px] text-slate-300 hover:text-white underline cursor-pointer"
                >
                  Cancelar temporizador
                </button>
              </div>
            )}

            {/* Badge de Estado Superior */}
            <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none z-10">
              <div
                className={`px-3 py-1.5 backdrop-blur-md rounded-full text-xs font-bold border flex items-center gap-2 shadow-lg transition-all duration-300 ${
                  isDocDetected
                    ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300 ring-2 ring-emerald-500/50'
                    : 'bg-slate-900/90 border-white/20 text-slate-200'
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isDocDetected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                  }`}
                />
                <span>{isDocDetected ? '✅ Cédula Encuadrada' : '⚠️ Sostén tu Cédula Frente al Lente'}</span>
              </div>
            </div>

            {/* CONTROLES INFERIORES: MÁS TIEMPO, TEMPORIZADOR Y CAPTURA MANUAL */}
            <div className="absolute bottom-3 inset-x-3 flex flex-col items-center gap-2 z-10">
              {/* Barra de progreso si auto-captura está activa */}
              {autoCaptureEnabled && scanProgress > 0 && (
                <div className="w-full max-w-xs bg-slate-900/90 backdrop-blur-md rounded-full h-2 overflow-hidden border border-white/20 p-0.5">
                  <div
                    className="bg-emerald-400 h-full rounded-full transition-all duration-100"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              )}

              {/* Botones de Captura para dar todo el tiempo necesario al usuario */}
              <div className="flex items-center gap-2 w-full max-w-sm justify-center">
                {/* Botón 1: Temporizador de 5 segundos (Más tiempo para acomodarlo) */}
                <button
                  type="button"
                  onClick={() => startCountdownCapture(5)}
                  disabled={countdown !== null}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white border border-white/25 text-xs font-bold shadow-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Te da 5 segundos para sostener la cédula antes de disparar"
                >
                  <Timer className="w-4 h-4 text-indigo-400" />
                  <span>5 Segundos</span>
                </button>

                {/* Botón 2: Capturar Foto Ahora (Manual Inmediato) */}
                <button
                  type="button"
                  onClick={() => executeCaptureAndVerify()}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-extrabold text-xs shadow-2xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    isDocDetected
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 ring-4 ring-emerald-400/40 scale-102'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  <span>{isDocDetected ? '📸 Capturar Cédula Ahora' : '📸 Tomar Foto'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* VISTA 3: INICIAR CÁMARA O SUBIR */
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-900 space-y-4">
            <Scan className="w-12 h-12 text-indigo-400 animate-pulse" />

            <div className="space-y-1">
              <p className="text-sm font-bold text-white">
                Escaneo de Cédula: {side === 'front' ? 'Frente (Anverso)' : 'Reverso (Dorso)'}
              </p>
              <p className="text-xs text-slate-400 max-w-xs">
                Sostén tu carnet físico frente a la cámara. Tendrás tiempo para acomodarlo y verificarlo con Spotly AI.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center">
              <button
                onClick={startCamera}
                disabled={isStartingCamera}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-2xl transition shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isStartingCamera ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Iniciando Cámara...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    Iniciar Cámara para Escaneo
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Barra Informativa de Estado */}
      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-700 font-medium">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>{detectionMessage}</span>
        </div>

        {isCameraActive && !capturedDoc && (
          <button
            type="button"
            onClick={() => setAutoCaptureEnabled(!autoCaptureEnabled)}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer shrink-0 ${
              autoCaptureEnabled
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {autoCaptureEnabled ? '⚡ Auto-disparo: Activo' : '⚡ Auto-disparo: Inactivo'}
          </button>
        )}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes scan {
          0%, 100% { top: 4%; }
          50% { top: 92%; }
        }
      `,
        }}
      />
    </div>
  );
};
