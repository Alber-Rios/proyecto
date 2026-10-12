import React, { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { verifyContractIntegrity, ContractIntegrityResult } from '../utils/contractHash.ts';
import { ShieldCheck, ShieldAlert, Loader2, Search } from 'lucide-react';

interface VerifyContractPageProps {
  onOpenAuth: (mode: 'login' | 'register', notice?: string) => void;
}

// Verificación de integridad de contratos (RF-26, CP-16): recalcula el SHA-256 del
// contrato almacenado y lo compara con el sello registrado y, opcionalmente, con el
// hash impreso en el PDF que la persona tiene en su poder.
export const VerifyContractPage: React.FC<VerifyContractPageProps> = ({ onOpenAuth }) => {
  const { currentUser, contracts } = useApp();
  const [folio, setFolio] = useState('');
  const [hash, setHash] = useState('');
  const [result, setResult] = useState<ContractIntegrityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    const contract = contracts.find((c) => c.id.toLowerCase() === folio.trim().toLowerCase());
    if (!contract) {
      setError('No encontramos ese folio entre los contratos de tu cuenta. Solo las partes del contrato y administración pueden verificarlo.');
      return;
    }
    setLoading(true);
    try {
      setResult(await verifyContractIntegrity(contract, hash));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-black text-slate-900">Verificar contrato</h1>
        <p className="text-sm text-slate-600">
          Cada contrato queda sellado con una huella SHA-256 calculada sobre su contenido íntegro. Ingresa el folio y,
          si quieres, el hash impreso en tu PDF para comprobar que el documento no fue alterado.
        </p>
      </div>

      {!currentUser ? (
        <div className="p-5 rounded-2xl bg-white border border-slate-200 text-sm text-slate-700 space-y-3">
          <p>Inicia sesión con la cuenta de una de las partes del contrato para verificarlo.</p>
          <button
            onClick={() => onOpenAuth('login', 'Inicia sesión para verificar un contrato.')}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
          >
            Iniciar sesión
          </button>
        </div>
      ) : (
        <form onSubmit={handleVerify} className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
          <label className="block text-xs font-bold text-slate-900">
            Folio del contrato
            <input
              value={folio}
              onChange={(e) => setFolio(e.target.value)}
              placeholder="CTR-…"
              required
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
            />
          </label>
          <label className="block text-xs font-bold text-slate-900">
            Hash SHA-256 impreso en el documento (opcional)
            <input
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              placeholder="64 caracteres hexadecimales"
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Verificar
          </button>

          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

          {result && (
            <div
              role="status"
              className={`p-4 rounded-xl border text-xs space-y-2 ${
                result.status === 'valid'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : result.status === 'legacy'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <p className="font-black text-sm flex items-center gap-2">
                {result.status === 'valid' ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                {result.message}
              </p>
              <p className="font-mono break-all">Sello registrado: {result.storedHash}</p>
              {result.computedHash && <p className="font-mono break-all">Hash recalculado: {result.computedHash}</p>}
            </div>
          )}
        </form>
      )}
    </div>
  );
};
