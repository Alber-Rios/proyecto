import React, { useEffect, useState } from 'react';
import { verifyContractIntegrity, ContractIntegrityResult, isSha256Hex } from '../utils/contractHash.ts';
import { DigitalContract } from '../types.ts';
import { formatClp, formatRut } from '../utils/formatters.ts';
import { downloadContractDocument } from '../utils/documentDownloader.ts';
import {
  ShieldCheck,
  Printer,
  Download,
  CheckCircle2,
  Lock,
  Copy,
  ShieldAlert,
  Loader2,
} from 'lucide-react';

interface ContractModalProps {
  contract: DigitalContract | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ContractModal: React.FC<ContractModalProps> = ({ contract, isOpen, onClose }) => {
  const [integrity, setIntegrity] = useState<ContractIntegrityResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    setIntegrity(null);
  }, [contract?.id]);

  if (!isOpen || !contract) return null;

  // RF-26: recalcula el SHA-256 del contenido y lo compara con el sello registrado.
  const handleVerify = async () => {
    setVerifying(true);
    try {
      setIntegrity(await verifyContractIntegrity(contract));
    } finally {
      setVerifying(false);
    }
  };

  const handleCopyHash = () => {
    navigator.clipboard?.writeText(contract.contractHash).then(
      () => alert('Código de verificación copiado.'),
      () => alert('No se pudo copiar. Selecciona el código y cópialo manualmente.')
    );
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-3xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200 animate-fadeIn my-auto sm:my-6 flex flex-col max-h-[92vh]">
        {/* Encabezado del Instrumento Notarial/Digital */}
        <div className="bg-slate-900 text-white p-4 sm:p-8 flex items-start justify-between gap-3 border-b border-slate-800 shrink-0">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11.5px] sm:text-xs font-semibold mb-2">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Contrato digital vinculante (Ley 19.799 & Ley 18.101)</span>
            </div>
            <h2 className="text-lg sm:text-2xl font-semibold tracking-tight">
              Contrato de arrendamiento temporal
            </h2>
            <p className="text-xs text-slate-400 mt-1 break-all">
              Folio de instrumento: <span className="font-mono text-slate-300">{contract.id}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Huella Criptográfica y Metadatos de Validación */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-6 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-1.5 text-slate-600 min-w-0 flex-wrap">
            <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{isSha256Hex(contract.contractHash) ? 'SHA-256:' : 'Sello (formato anterior):'} </span>
            <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-800 font-semibold truncate max-w-[180px] sm:max-w-none">
              {contract.contractHash}
            </span>
            <button
              onClick={handleCopyHash}
              className="text-brand-600 hover:text-brand-700 font-medium ml-1 flex items-center gap-1 cursor-pointer"
              title="Copiar Hash"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
          <div className="text-slate-500 text-[12.5px] sm:text-xs">
            Suscrito el:{' '}
            <span className="font-medium text-slate-700">
              {new Date(contract.signedAt).toLocaleString('es-CL')}
            </span>
          </div>
        </div>

        {/* Texto Legal Formateado */}
        <div className="p-4 sm:p-8 flex-1 overflow-y-auto space-y-5 sm:space-y-6 text-slate-700 leading-relaxed text-xs sm:text-sm font-serif">
          <div className="text-center font-semibold tracking-wider text-slate-900 border-b pb-4">
            CONTRATO DE ARRENDAMIENTO TEMPORAL DE INMUEBLE CON FINES COMERCIALES Y PROFESIONALES
          </div>

          <div className="space-y-4">
            {contract.clauses.map((clause, idx) => (
              <p key={idx} className="text-justify indent-4 break-words">
                {clause}
              </p>
            ))}
          </div>

          {/* Recuadro de Firmas Electrónicas */}
          <div className="pt-6 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 not-italic font-sans">
            {/* Firma Arrendatario */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 min-w-0">
              <div className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-500">
                Firma digital arrendatario (Ley 19.799)
              </div>
              {contract.signatureImage ? (
                <div className="bg-white p-2 rounded-xl border border-slate-200 inline-block w-full">
                  <img src={contract.signatureImage} alt="Firma Electrónica" className="h-16 max-w-full object-contain mx-auto" />
                </div>
              ) : (
                <div className="bg-slate-100 p-2 rounded-xl border border-slate-200 font-mono text-[11.5px] text-slate-700 break-all">
                  TOKEN FEA: {contract.tenantSignature.verificationToken}
                </div>
              )}
              <div className="text-sm font-semibold text-slate-900 break-words">{contract.tenantName}</div>
              <div className="text-xs text-slate-600">RUT: {formatRut(contract.tenantRut)}</div>
              <div className="text-[11.5px] text-slate-400 font-mono truncate">
                IP: {contract.signerIp || contract.tenantSignature.ip} • Hash: {contract.contractHash.slice(0, 16)}...
              </div>
              <div className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 shrink-0" /> Firma electrónica simple (Ley 19.799)
              </div>
            </div>

            {/* Propietario */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 min-w-0">
              <div className="text-[12.5px] font-semibold uppercase tracking-wider text-slate-500">
                Propietario / anfitrión
              </div>
              <div className="text-sm font-semibold text-slate-900 break-words">{contract.ownerName}</div>
              <div className="text-xs text-slate-600">RUT: {formatRut(contract.ownerRut)}</div>
              <div className="text-[12.5px] text-slate-500">
                Concurre mediante el Acuerdo de Adhesión de Anfitriones aceptado en la plataforma y la publicación de sus condiciones.
              </div>
            </div>
          </div>
        </div>

        {integrity && (
          <div
            className={`px-4 sm:px-6 py-3 text-xs border-t flex items-start gap-2 ${
              integrity.status === 'valid'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : integrity.status === 'legacy'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-brand-50 border-brand-200 text-brand-900'
            }`}
            role="status"
          >
            {integrity.status === 'valid' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-semibold">{integrity.message}</p>
              {integrity.computedHash && (
                <p className="font-mono text-[11.5px] break-all mt-1">Recalculado: {integrity.computedHash}</p>
              )}
            </div>
          </div>
        )}

        {/* Footer con acciones */}
        <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => downloadContractDocument(contract)}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4 shrink-0" />
              Descargar PDF
            </button>
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 shrink-0" />}
              Verificar integridad
            </button>
            <button
              onClick={handlePrint}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-4 h-4 shrink-0" />
              Imprimir / guardar PDF
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 sm:py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer text-center"
          >
            Cerrar instrumento
          </button>
        </div>
      </div>
    </div>
  );
};
