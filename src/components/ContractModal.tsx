import React, { useEffect, useId, useRef, useState } from 'react';
import { verifyContractIntegrity, ContractIntegrityResult, isSha256Hex } from '../utils/contractHash.ts';
import { DigitalContract } from '../types.ts';
import { formatRut } from '../utils/formatters.ts';
import { downloadContractDocument } from '../utils/documentDownloader.ts';
import { formatContractTerm, hoursFromClauses, intendedUseFromClauses } from '../utils/contractTerm.ts';
import { ContractDocument } from './contract/ContractDocument.tsx';
import { ShieldCheck, Printer, Download, CheckCircle2, Copy, ShieldAlert, Loader2, X } from 'lucide-react';

interface ContractModalProps {
  contract: DigitalContract | null;
  isOpen: boolean;
  onClose: () => void;
}

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600';

export const ContractModal: React.FC<ContractModalProps> = ({ contract, isOpen, onClose }) => {
  const [integrity, setIntegrity] = useState<ContractIntegrityResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setIntegrity(null);
    setCopyMessage(null);
  }, [contract?.id]);

  // Diálogo accesible: foco en "Cerrar", Escape cierra y el fondo no se desplaza.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [isOpen]);

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
      () => setCopyMessage('Código de verificación copiado.'),
      () => setCopyMessage('No se pudo copiar. Selecciona el código y cópialo manualmente.')
    );
  };

  const hours = hoursFromClauses(contract.clauses);
  const term = formatContractTerm({
    modality: contract.rentalModality,
    startDate: contract.startDate,
    endDate: contract.endDate,
    hourStart: hours?.hourStart,
    hourEnd: hours?.hourEnd,
  });
  const signedAt = new Date(contract.signedAt).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' });
  const sealed = isSha256Hex(contract.contractHash);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs p-2 sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="mx-auto my-2 flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-2xl sm:my-6 sm:rounded-3xl"
      >
        {/* Barra superior */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-slate-950 sm:text-lg">
              Contrato firmado
            </h2>
            <p className="flex items-center gap-1.5 text-sm text-emerald-800">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              Firma electrónica simple · sellado con {sealed ? 'SHA-256' : 'formato anterior'}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar contrato"
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 ${focusRing}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-3 sm:p-6">
          <ContractDocument
            status="signed"
            folio={contract.id}
            issuedAt={`Suscrito en Santiago de Chile el ${signedAt}`}
            intendedUse={intendedUseFromClauses(contract.clauses)}
            owner={{ name: contract.ownerName, rut: formatRut(contract.ownerRut) || 'no informado' }}
            tenant={{ name: contract.tenantName, rut: formatRut(contract.tenantRut) }}
            spaceTitle={contract.spaceTitle}
            spaceAddress={contract.spaceAddress}
            term={term}
            amounts={
              contract.guaranteeDepositClp > 0
                ? [{ label: 'Garantía reembolsable (incluida en el total)', value: contract.guaranteeDepositClp }]
                : []
            }
            total={contract.totalClp}
            clauses={contract.clauses}
          >
            {/* Firmas */}
            <section aria-label="Firmas" className="grid gap-[1em] border-t border-slate-200 pt-[1.5em] sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-slate-300 p-[1em]">
                <p className="text-[0.8125em] font-semibold text-slate-700">Arrendatario</p>
                {contract.signatureImage ? (
                  <img
                    src={contract.signatureImage}
                    alt={`Firma manuscrita digital de ${contract.tenantName}`}
                    className="mt-[0.5em] h-[4.5em] max-w-full border-b border-slate-400 object-contain"
                  />
                ) : (
                  <p className="mt-[0.5em] border-b border-slate-400 pb-[0.5em] font-mono text-[0.875em] break-all text-slate-800">
                    Token de firma: {contract.tenantSignature.verificationToken}
                  </p>
                )}
                <p className="mt-[0.5em] font-bold text-slate-950">{contract.tenantName}</p>
                <p className="text-[0.9375em] text-slate-800">RUT {formatRut(contract.tenantRut)}</p>
                <p className="mt-[0.35em] text-[0.875em] text-slate-700">
                  Firmó el {signedAt} desde la IP {contract.signerIp || contract.tenantSignature.ip}
                </p>
              </div>

              <div className="min-w-0 rounded-xl border border-slate-300 p-[1em]">
                <p className="text-[0.8125em] font-semibold text-slate-700">Arrendador (propietario)</p>
                <p className="mt-[0.5em] border-b border-slate-400 pb-[0.5em] text-[0.9375em] text-slate-800 italic">
                  Concurre mediante el Acuerdo de Adhesión de Anfitriones aceptado en Spotly
                </p>
                <p className="mt-[0.5em] font-bold text-slate-950">{contract.ownerName}</p>
                <p className="text-[0.9375em] text-slate-800">RUT {formatRut(contract.ownerRut) || 'no informado'}</p>
              </div>
            </section>

            {/* Sello de integridad */}
            <section aria-label="Sello de integridad" className="rounded-xl bg-slate-50 p-[1em] ring-1 ring-slate-200">
              <p className="text-[0.875em] font-bold text-slate-900">
                {sealed ? 'Sello de integridad SHA-256' : 'Sello (formato anterior)'}
              </p>
              <p className="mt-[0.35em] font-mono text-[0.875em] leading-relaxed break-all text-slate-900">
                {contract.contractHash}
              </p>
              <p className="mt-[0.35em] text-[0.875em] text-slate-700">
                Si se cambia una sola letra del contrato, este código deja de coincidir. Usa “Verificar integridad” para
                comprobarlo.
              </p>
            </section>
          </ContractDocument>
        </div>

        {(integrity || copyMessage) && (
          <div
            role="status"
            className={`mx-3 mb-3 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm sm:mx-6 ${
              !integrity
                ? 'border-slate-200 bg-white text-slate-900'
                : integrity.status === 'valid'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                  : integrity.status === 'legacy'
                    ? 'border-amber-300 bg-amber-50 text-amber-950'
                    : 'border-rose-300 bg-rose-50 text-rose-950'
            }`}
          >
            {integrity ? (
              <>
                {integrity.status === 'valid' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="font-bold">{integrity.message}</p>
                  {integrity.computedHash && (
                    <p className="mt-1 font-mono text-xs break-all">Recalculado: {integrity.computedHash}</p>
                  )}
                </div>
              </>
            ) : (
              <p>{copyMessage}</p>
            )}
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-col gap-2 border-t border-slate-200 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-5">
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={() => downloadContractDocument(contract)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 text-sm font-bold text-white transition hover:bg-rose-800 ${focusRing}`}
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
              Descargar PDF
            </button>
            <button
              type="button"
              onClick={() => {
                if (!verifying) void handleVerify();
              }}
              aria-busy={verifying}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-400 bg-emerald-50 px-4 text-sm font-bold text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-60 ${focusRing}`}
            >
              {verifying ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              Verificar integridad
            </button>
            <button
              type="button"
              onClick={handleCopyHash}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 ${focusRing}`}
            >
              <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
              Copiar código de verificación
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 ${focusRing}`}
            >
              <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
              Imprimir
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`min-h-11 rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 ${focusRing}`}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
