import React, { useRef, useState, useEffect } from 'react';
import { RotateCcw, Check, PenTool } from 'lucide-react';

interface SignatureCanvasProps {
  onSignatureChange: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
}

export const SignatureCanvas: React.FC<SignatureCanvasProps> = ({
  onSignatureChange,
  width = 500,
  height = 180,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set line style for pen look
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a'; // dark slate ink
  }, []);

  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSignatureChange(canvas.toDataURL('image/png'));
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSignatureChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-slate-700 flex items-center gap-1.5">
          <PenTool className="w-3.5 h-3.5 text-rose-600" />
          <span>Firma Manuscrita en Pantalla (Dibuja con tu dedo o cursor)</span>
        </span>
        {hasSignature ? (
          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1">
            <Check className="w-3 h-3 text-emerald-600" />
            Firma estampada
          </span>
        ) : (
          <span className="text-slate-400 text-[11px]">Traza tu firma sobre el recuadro</span>
        )}
      </div>

      <div className="relative border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/70 overflow-hidden hover:border-slate-400 transition touch-none">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          className="w-full h-[140px] cursor-crosshair block"
        />

        {/* Guía visual de firma en la base */}
        <div className="absolute bottom-6 left-8 right-8 border-b border-slate-200 pointer-events-none flex justify-between text-[9px] text-slate-400">
          <span>✕ Firma del Arrendatario</span>
          <span>Ley N° 19.799</span>
        </div>

        {/* Botón de limpiar */}
        {hasSignature && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-2.5 right-2.5 px-2.5 py-1 bg-white/90 hover:bg-white text-slate-700 border border-slate-200 rounded-lg text-[11px] font-bold shadow-xs transition flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Borrar y repetir</span>
          </button>
        )}
      </div>
    </div>
  );
};
