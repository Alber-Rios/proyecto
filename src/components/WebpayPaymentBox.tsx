import React, { useState } from 'react';
import { PaymentSimulationData } from '../types.ts';
import { formatClp, formatRut } from '../utils/formatters.ts';
import { useApp } from '../context/AppContext.tsx';
import {
  CreditCard,
  Lock,
  Building,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

interface WebpayPaymentBoxProps {
  totalAmountClp: number;
  initialCardHolder?: string;
  initialRut?: string;
  onPaymentSuccess: (data: PaymentSimulationData) => void;
  onCancel?: () => void;
}

const CHILEAN_BANKS = [
  { id: 'bancoestado', name: 'BancoEstado (CuentaRUT / Cuenta Pro)', color: 'bg-amber-600' },
  { id: 'bancodechile', name: 'Banco de Chile / Edwards', color: 'bg-blue-800' },
  { id: 'santander', name: 'Banco Santander Chile', color: 'bg-red-600' },
  { id: 'bci', name: 'Banco BCI / TBanc', color: 'bg-blue-600' },
  { id: 'scotiabank', name: 'Scotiabank Chile', color: 'bg-red-700' },
  { id: 'itau', name: 'Itaú Corpbanca', color: 'bg-orange-600' },
  { id: 'falabella', name: 'Banco Falabella', color: 'bg-emerald-600' },
  { id: 'tenpo', name: 'Tenpo Prepago / Débito', color: 'bg-purple-600' },
  { id: 'mach', name: 'MACH (BCI)', color: 'bg-indigo-600' },
];

export const WebpayPaymentBox: React.FC<WebpayPaymentBoxProps> = ({
  totalAmountClp,
  initialCardHolder = 'MATIAS SILVA CONTRERAS',
  initialRut = '18.492.301-8',
  onPaymentSuccess,
  onCancel,
}) => {
  const { savedCards, addSavedCard, deleteSavedCard } = useApp();
  
  const [useSavedCard, setUseSavedCard] = useState<boolean>(savedCards.length > 0);
  const [selectedCardId, setSelectedCardId] = useState<string>(savedCards[0]?.id || '');
  const [saveNewCard, setSaveNewCard] = useState<boolean>(true);

  const [paymentType, setPaymentType] = useState<'debito' | 'credito' | 'prepago'>('debito');
  const [selectedBank, setSelectedBank] = useState<string>('bancoestado');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState(initialCardHolder);
  const [cardHolderRut, setCardHolderRut] = useState(initialRut);
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [installments, setInstallments] = useState<number>(1);

  // Estados del proceso de pago de Transbank
  const [processingState, setProcessingState] = useState<'idle' | 'connecting' | 'verifying' | 'approved'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 16) val = val.slice(0, 16);
    // Format with space every 4 digits
    const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
    setCardNumber(formatted);
  };

  const handleFillDemoCard = (type: 'debito' | 'credito') => {
    if (type === 'debito') {
      setPaymentType('debito');
      setSelectedBank('bancoestado');
      setCardNumber('5412 7532 9011 4488');
      setCardHolder(initialCardHolder || 'MATIAS SILVA C.');
      setCardExpiry('10/29');
      setCardCvv('512');
      setInstallments(1);
    } else {
      setPaymentType('credito');
      setCardNumber('4500 8821 3490 7712');
      setCardHolder(initialCardHolder || 'MATIAS SILVA C.');
      setCardExpiry('12/28');
      setCardCvv('892');
      setInstallments(3);
    }
  };

  const handleProcessPayment = () => {
    setErrorMessage(null);
    let finalCardBrand: 'visa' | 'mastercard' | 'redcompra' = 'visa';
    let finalLast4 = '';
    let finalCardHolder = '';

    if (useSavedCard) {
      const card = savedCards.find((c) => c.id === selectedCardId);
      if (!card) {
        setErrorMessage('Por favor selecciona una tarjeta guardada o ingresa una nueva.');
        return;
      }
      finalCardBrand = card.cardBrand;
      finalLast4 = card.last4;
      finalCardHolder = card.cardHolder;
    } else {
      const cleanCard = cardNumber.replace(/\s+/g, '');
      if (cleanCard.length < 15) {
        setErrorMessage('Por favor ingresa un número de tarjeta válido de 16 dígitos.');
        return;
      }
      if (!cardHolder.trim()) {
        setErrorMessage('Por favor indica el nombre del titular de la tarjeta.');
        return;
      }
      finalCardBrand = paymentType === 'debito' ? 'redcompra' : cleanCard.startsWith('4') ? 'visa' : 'mastercard';
      finalLast4 = cleanCard.slice(-4);
      finalCardHolder = cardHolder.trim().toUpperCase();

      if (saveNewCard) {
        addSavedCard({
          cardBrand: finalCardBrand,
          cardHolder: finalCardHolder,
          last4: finalLast4,
          expiryMonth: cardExpiry.split('/')[0] || '12',
          expiryYear: cardExpiry.split('/')[1] || '29',
          bankName: CHILEAN_BANKS.find(b => b.id === selectedBank)?.name || 'Banco',
        });
      }
    }

    // Iniciar simulación realista de Transbank
    setProcessingState('connecting');

    setTimeout(() => {
      setProcessingState('verifying');

      setTimeout(() => {
        setProcessingState('approved');

        setTimeout(() => {
          const authCode = Math.floor(100000 + Math.random() * 900000).toString();
          const txCode = `TBK-${Date.now().toString().slice(-8)}`;

          onPaymentSuccess({
            cardBrand: finalCardBrand,
            last4: finalLast4,
            cardHolder: finalCardHolder,
            installments: Number(installments),
            transactionCode: txCode,
            authorizationCode: authCode,
            paidAt: new Date().toISOString(),
            status: 'approved',
          });
        }, 800);
      }, 1000);
    }, 900);
  };

  return (
    <div className="space-y-4">
      {/* Banner Oficial Transbank Webpay Plus */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 border border-slate-800 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-extrabold text-xs tracking-wider uppercase">
              Webpay Plus
            </span>
            <span className="px-2 py-0.5 rounded-md bg-blue-600/30 text-blue-400 text-[10px] font-bold border border-blue-500/30">
              Redcompra
            </span>
            <span className="text-slate-400 text-[11px] font-medium hidden sm:inline">
              Transbank Chile
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-semibold bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-800/60">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>SSL 256-bit Seguro</span>
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-between pt-2 border-t border-slate-800">
          <div>
            <span className="text-[11px] text-slate-400 block">Total a Pagar en Moneda Nacional:</span>
            <span className="text-2xl font-black text-white tracking-tight">{formatClp(totalAmountClp)}</span>
          </div>
          <button
            type="button"
            onClick={() => handleFillDemoCard('debito')}
            className="text-[11px] text-rose-400 hover:text-rose-300 font-bold underline flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3 h-3" />
            <span>Tarjeta de prueba</span>
          </button>
        </div>
      </div>

      {savedCards.length > 0 && (
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-700 block">Mis Tarjetas Guardadas</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {savedCards.map((card) => (
              <label
                key={card.id}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  useSavedCard && selectedCardId === card.id
                    ? 'border-rose-500 bg-rose-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
                onClick={() => {
                  setUseSavedCard(true);
                  setSelectedCardId(card.id);
                }}
              >
                <input
                  type="radio"
                  name="saved_card"
                  checked={useSavedCard && selectedCardId === card.id}
                  readOnly
                  className="mt-1 w-4 h-4 text-rose-600 border-slate-300 focus:ring-rose-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-xs font-bold text-slate-900 uppercase">
                      {card.cardBrand === 'visa' ? 'VISA' : card.cardBrand === 'mastercard' ? 'MASTERCARD' : 'REDCOMPRA'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSavedCard(card.id);
                        if (selectedCardId === card.id) {
                          setUseSavedCard(false);
                          setSelectedCardId('');
                        }
                      }}
                      className="text-[10px] text-red-500 hover:text-red-700 underline"
                    >
                      Eliminar
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    •••• •••• •••• {card.last4}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 truncate">
                    {card.bankName}
                  </div>
                </div>
              </label>
            ))}
            
            <label
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed cursor-pointer transition ${
                !useSavedCard
                  ? 'border-rose-500 bg-rose-50 text-rose-700'
                  : 'border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
              onClick={() => setUseSavedCard(false)}
            >
              <input
                type="radio"
                name="saved_card"
                checked={!useSavedCard}
                readOnly
                className="hidden"
              />
              <span className="text-xs font-bold">+ Usar Nueva Tarjeta</span>
            </label>
          </div>
        </div>
      )}

      {/* Selector de Métodos de Pago: Débito / Crédito / Prepago (sólo si no usa tarjeta guardada) */}
      {!useSavedCard && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setPaymentType('debito')}
          className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
            paymentType === 'debito'
              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Débito (Redcompra)</span>
        </button>

        <button
          type="button"
          onClick={() => setPaymentType('credito')}
          className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
            paymentType === 'credito'
              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Crédito (en Cuotas)</span>
        </button>

        <button
          type="button"
          onClick={() => setPaymentType('prepago')}
          className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
            paymentType === 'prepago'
              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Prepago (Tenpo / MACH)</span>
        </button>
      </div>

      {/* Si es Débito: Selección de Banco Emisor */}
      {paymentType === 'debito' && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-slate-500" />
            <span>Banco Emisor de la Cuenta:</span>
          </label>
          <select
            value={selectedBank}
            onChange={(e) => setSelectedBank(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
          >
            {CHILEAN_BANKS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Si es Crédito: Selección de Cuotas */}
      {paymentType === 'credito' && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700">Modalidad de Cuotas Transbank:</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { val: 1, label: '1 Cuota al contado' },
              { val: 3, label: '3 Cuotas sin interés' },
              { val: 6, label: '6 Cuotas' },
              { val: 12, label: '12 Cuotas' },
            ].map((c) => (
              <button
                key={c.val}
                type="button"
                onClick={() => setInstallments(c.val)}
                className={`py-2 px-2.5 rounded-xl border text-center text-xs font-bold transition cursor-pointer ${
                  installments === c.val
                    ? 'bg-rose-50 border-rose-500 text-rose-700'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Campos de la Tarjeta */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
        {/* Número de Tarjeta */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-700 flex justify-between">
            <span>Número de Tarjeta</span>
            <span className="text-slate-400 font-normal">16 dígitos</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={cardNumber}
              onChange={handleCardNumberChange}
              placeholder="4500 0000 0000 0000"
              maxLength={19}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              <span className="text-[10px] font-black tracking-widest text-slate-400">
                {cardNumber.startsWith('4') ? 'VISA' : cardNumber.startsWith('5') ? 'MC' : 'REDCOMPRA'}
              </span>
            </div>
          </div>
        </div>

        {/* Titular y RUT */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700">Nombre del Titular</label>
            <input
              type="text"
              value={cardHolder}
              onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
              placeholder="MATIAS SILVA"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold uppercase text-slate-900 bg-white focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700">RUT del Titular</label>
            <input
              type="text"
              value={cardHolderRut}
              onChange={(e) => setCardHolderRut(e.target.value)}
              placeholder="18.492.301-8"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Vencimiento y CVV */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700">Vencimiento (MM/AA)</label>
            <input
              type="text"
              value={cardExpiry}
              onChange={(e) => setCardExpiry(e.target.value)}
              placeholder="12/28"
              maxLength={5}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-rose-500 focus:outline-hidden text-center"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 flex justify-between">
              <span>CVV / Clave</span>
              <span className="text-slate-400 font-normal">Dorso</span>
            </label>
            <input
              type="password"
              value={cardCvv}
              onChange={(e) => setCardCvv(e.target.value.slice(0, 4))}
              placeholder="892"
              maxLength={4}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-rose-500 focus:outline-hidden text-center"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 pt-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={saveNewCard}
            onChange={(e) => setSaveNewCard(e.target.checked)}
            className="w-4 h-4 text-rose-600 rounded-md border-slate-300 focus:ring-rose-500 cursor-pointer"
          />
          <span className="text-[11px] font-semibold text-slate-700 group-hover:text-slate-900 transition">
            Guardar esta tarjeta para futuras reservas de forma segura
          </span>
        </label>
      </div>
      </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Overlay de Simulación de Transbank en tiempo real */}
      {processingState !== 'idle' && (
        <div className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 space-y-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            {processingState === 'approved' ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            ) : (
              <RotateCcw className="w-6 h-6 text-rose-500 animate-spin" />
            )}
            <div>
              <div className="text-xs font-bold text-white">
                {processingState === 'connecting' && 'Conectando con Transbank Webpay Plus...'}
                {processingState === 'verifying' && 'Validando con el banco emisor chileno...'}
                {processingState === 'approved' && '¡Pago Aprobado Exitosamente!'}
              </div>
              <div className="text-[11px] text-slate-400">
                Código de Comercio: 597020000540 • Protocolo seguro TLS 1.3
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Botón de Pagar */}
      <div className="flex items-center justify-between pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={processingState !== 'idle'}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
          >
            Volver
          </button>
        )}

        <button
          type="button"
          onClick={handleProcessPayment}
          disabled={processingState !== 'idle'}
          className={`ml-auto px-6 py-3 rounded-xl font-bold text-xs text-white transition flex items-center gap-2 shadow-lg cursor-pointer ${
            processingState !== 'idle'
              ? 'bg-slate-400 cursor-not-allowed'
              : 'bg-rose-600 hover:bg-rose-700'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Pagar {formatClp(totalAmountClp)} con Webpay Plus</span>
        </button>
      </div>
    </div>
  );
};
