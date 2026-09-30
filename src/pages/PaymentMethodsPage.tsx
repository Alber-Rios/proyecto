import React, { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { formatClp, formatRut } from '../utils/formatters.ts';
import { SavedCard } from '../types.ts';
import {
  CreditCard,
  ShieldCheck,
  Plus,
  Trash2,
  CheckCircle2,
  Lock,
  FileText,
  AlertCircle,
  Building2,
  Calendar,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Info,
  Clock,
  Printer,
  Copy,
  Check,
  LogIn,
  UserPlus,
  ArrowRight,
} from 'lucide-react';

interface PaymentMethodsPageProps {
  onNavigate: (view: string) => void;
  onOpenAuth: (mode: 'login' | 'register', notice?: string) => void;
}

const CHILEAN_BANKS = [
  'Banco de Chile / Edwards',
  'Banco Santander',
  'BancoEstado (CuentaRUT / Pro)',
  'BCI (Banco de Crédito e Inversiones)',
  'Scotiabank Chile',
  'Itaú Chile',
  'Banco Falabella',
  'Banco BICE',
  'Banco Security',
  'Tenpo / Prepago',
  'MACH / BCI Prepago',
];

export const PaymentMethodsPage: React.FC<PaymentMethodsPageProps> = ({
  onNavigate,
  onOpenAuth,
}) => {
  const {
    currentUser,
    savedCards,
    addSavedCard,
    deleteSavedCard,
    setDefaultCard,
    reservations,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'cards' | 'history' | 'legal'>('cards');
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<any | null>(null);
  const [copiedFolio, setCopiedFolio] = useState(false);

  // Formulario nueva tarjeta
  const [bankName, setBankName] = useState(CHILEAN_BANKS[0]);
  const [cardBrand, setCardBrand] = useState<'visa' | 'mastercard' | 'redcompra'>('visa');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState(currentUser?.fullName || '');
  const [expiryMonth, setExpiryMonth] = useState('12');
  const [expiryYear, setExpiryYear] = useState('28');
  const [cardCvv, setCardCvv] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardSuccessMessage, setCardSuccessMessage] = useState<string | null>(null);

  // Tarjetas del usuario actual
  const userCards = currentUser
    ? savedCards.filter((c) => c.userId === currentUser.id)
    : [];

  // Historial de pagos del usuario actual (reservas pagadas)
  const myPayments = currentUser
    ? reservations
        .filter((r) => r.tenantId === currentUser.id && r.paymentSimulation)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];

  const handleCardNumberInput = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 16);
    const formatted = digitsOnly.replace(/(\d{4})(?=\d)/g, '$1 ');
    setCardNumber(formatted);

    // Auto-detección básica de franquicia
    if (digitsOnly.startsWith('4')) {
      setCardBrand('visa');
    } else if (digitsOnly.startsWith('5') || digitsOnly.startsWith('2')) {
      setCardBrand('mastercard');
    } else if (bankName.includes('CuentaRUT') || digitsOnly.startsWith('59')) {
      setCardBrand('redcompra');
    }
  };

  const handleSaveNewCard = (e: React.FormEvent) => {
    e.preventDefault();
    setCardError(null);

    const cleanCard = cardNumber.replace(/\s+/g, '');
    if (cleanCard.length < 15) {
      setCardError('El número de tarjeta debe tener entre 15 y 16 dígitos numéricos.');
      return;
    }

    if (!cardHolder.trim() || cardHolder.trim().length < 4) {
      setCardError('Por favor ingresa el nombre y apellido completo tal como figura en el plástico bancario.');
      return;
    }

    if (cardCvv.length < 3) {
      setCardError('El código de seguridad CVV/CVC debe tener al menos 3 dígitos.');
      return;
    }

    addSavedCard({
      bankName,
      cardBrand,
      cardHolder: cardHolder.trim().toUpperCase(),
      last4: cleanCard.slice(-4),
      expiryMonth,
      expiryYear,
      isDefault: isDefault || userCards.length === 0, // Primera tarjeta siempre default
    });

    setIsAddCardModalOpen(false);
    setCardSuccessMessage(`Tarjeta ${bankName} terminada en ${cleanCard.slice(-4)} guardada con éxito.`);
    setTimeout(() => setCardSuccessMessage(null), 4000);

    // Reset
    setCardNumber('');
    setCardCvv('');
    setIsDefault(false);
  };

  const handleCopyFolio = (folio: string) => {
    navigator.clipboard.writeText(folio);
    setCopiedFolio(true);
    setTimeout(() => setCopiedFolio(false), 2000);
  };

  // Card background styling based on bank
  const getCardBgGradient = (bank: string, brand: string) => {
    if (bank.includes('Santander')) {
      return 'bg-gradient-to-tr from-red-900 via-rose-950 to-slate-900 border-red-800/40';
    }
    if (bank.includes('Chile')) {
      return 'bg-gradient-to-tr from-slate-950 via-blue-950 to-cyan-950 border-blue-900/40';
    }
    if (bank.includes('BancoEstado') || brand === 'redcompra') {
      return 'bg-gradient-to-tr from-amber-950 via-orange-950 to-slate-950 border-orange-800/40';
    }
    if (bank.includes('BCI')) {
      return 'bg-gradient-to-tr from-blue-950 via-slate-900 to-indigo-950 border-indigo-800/40';
    }
    return 'bg-gradient-to-tr from-slate-950 via-slate-900 to-zinc-900 border-slate-800';
  };

  return (
    <div className="space-y-8 pb-16 animate-fadeIn">
      {/* HEADER DE LA SECCIÓN */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xs border border-slate-200 relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-rose-50 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-rose-50 text-rose-700 border border-rose-200">
                Billetera & Medios de Pago Spotly
              </span>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Estándar Transbank Webpay Plus
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Gestión de Tarjetas y Pagos
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl">
              Administra tus métodos de pago bancarios en pesos chilenos (CLP), consulta el historial de arriendos formalizados y visualiza los comprobantes oficiales con custodia legal de garantía (Ley N° 18.101).
            </p>
          </div>

          {currentUser && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setCardHolder(currentUser.fullName);
                  setIsAddCardModalOpen(true);
                }}
                className="px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition flex items-center gap-2 transform active:scale-95"
              >
                <Plus className="w-4 h-4" />
                Añadir Tarjeta Bancaria
              </button>
            </div>
          )}
        </div>

        {/* TABS DE NAVEGACIÓN */}
        <div className="flex items-center gap-2 sm:gap-3 mt-6 pt-4 border-t border-slate-100 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('cards')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'cards'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Tarjetas Guardadas ({userCards.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'history'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            Comprobantes y Pagos ({myPayments.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('legal')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'legal'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Custodia Ley N° 18.101
          </button>
        </div>
      </div>

      {/* MENSAJE DE ÉXITO TEMPORAL */}
      {cardSuccessMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center gap-3 animate-fadeIn shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-semibold">{cardSuccessMessage}</span>
        </div>
      )}

      {/* CASO: USUARIO EN MODO VISITANTE (NO LOGUEADO) */}
      {!currentUser && (
        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xs border border-slate-200 text-center space-y-5 max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600 shadow-xs">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <span className="text-xs font-bold text-amber-700 bg-amber-100/70 px-3 py-1 rounded-full uppercase tracking-wider">
              Acceso Protegido • Modo Visitante
            </span>
            <h2 className="text-2xl font-bold text-slate-900">
              Inicia sesión para gestionar tus medios de pago
            </h2>
            <p className="text-slate-600 text-xs sm:text-sm max-w-lg mx-auto leading-relaxed">
              Por estrictas razones de seguridad bancaria y confidencialidad financiera, la billetera de tarjetas de crédito/débito y los recibos de transacciones solo están habilitados para usuarios registrados con RUT chileno.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onOpenAuth('login', 'Inicia sesión para acceder a tu billetera y gestionar tus tarjetas.')}
              className="px-6 py-3 rounded-2xl bg-slate-900 hover:bg-black text-white font-bold text-xs sm:text-sm transition flex items-center gap-2 shadow-sm"
            >
              <LogIn className="w-4 h-4" />
              Iniciar Sesión
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('register', 'Regístrate con tu RUT para habilitar pagos seguros y contratos digitales.')}
              className="px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm transition flex items-center gap-2 shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              Crear Cuenta Gratis
            </button>
          </div>

          <div className="pt-6 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                Cifrado TLS 1.3
              </div>
              <p className="text-[11px] text-slate-500">Tus credenciales nunca se comparten en texto plano.</p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
                Ley N° 18.101
              </div>
              <p className="text-[11px] text-slate-500">Garantías de arriendo custodiadas contra inventario.</p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                Banca Chilena
              </div>
              <p className="text-[11px] text-slate-500">Soporte CuentaRUT, Visa, Mastercard y Redcompra.</p>
            </div>
          </div>
        </div>
      )}

      {/* CASO: USUARIO LOGUEADO */}
      {currentUser && (
        <>
          {/* TAB 1: MIS TARJETAS BANCARIAS */}
          {activeTab === 'cards' && (
            <div className="space-y-6">
              {userCards.length === 0 ? (
                <div className="bg-white rounded-3xl p-10 text-center space-y-4 border border-slate-200">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                    <CreditCard className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">No tienes tarjetas registradas en tu billetera</h3>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                    Añade una tarjeta de crédito o débito de cualquier banco chileno para agilizar el pago de tus reservas de recintos comerciales y salones.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCardHolder(currentUser.fullName);
                      setIsAddCardModalOpen(true);
                    }}
                    className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Añadir mi primera tarjeta
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {userCards.map((card) => {
                    const gradientClass = getCardBgGradient(card.bankName, card.cardBrand);
                    return (
                      <div
                        key={card.id}
                        className={`rounded-3xl p-6 text-white shadow-xl border relative flex flex-col justify-between aspect-16/10 overflow-hidden transition transform hover:-translate-y-1 ${gradientClass}`}
                      >
                        {/* Brillo de fondo */}
                        <div className="absolute -right-10 -top-10 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />

                        {/* Top: Chip y Franquicia */}
                        <div className="flex items-center justify-between relative z-10">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-7 bg-gradient-to-r from-amber-400 to-amber-200 rounded-md shadow-xs border border-amber-300 flex items-center justify-center">
                              <div className="w-7 h-4 border border-amber-600/40 rounded-xs" />
                            </div>
                            <span className="text-[11px] font-bold text-slate-200 tracking-wider">
                              {card.bankName}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {card.isDefault && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                                <Check className="w-2.5 h-2.5" /> Predeterminada
                              </span>
                            )}
                            <span className="text-xs font-black tracking-widest uppercase text-white/90">
                              {card.cardBrand === 'redcompra' ? 'REDCOMPRA' : card.cardBrand.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        {/* Center: Número de Tarjeta */}
                        <div className="space-y-1 my-3 relative z-10">
                          <div className="text-[9px] uppercase tracking-widest text-slate-400">
                            Número Enmascarado
                          </div>
                          <div className="font-mono text-base sm:text-lg font-bold tracking-widest text-white drop-shadow-xs">
                            •••• •••• •••• {card.last4}
                          </div>
                        </div>

                        {/* Bottom: Titular y Expiración */}
                        <div className="flex items-end justify-between text-xs relative z-10 pt-2 border-t border-white/10">
                          <div className="space-y-0.5">
                            <span className="text-[8px] uppercase tracking-wider text-slate-400 block">
                              Titular de la Cuenta
                            </span>
                            <span className="font-bold tracking-wider truncate max-w-[170px] block text-[11px]">
                              {card.cardHolder}
                            </span>
                          </div>

                          <div className="space-y-0.5 text-right">
                            <span className="text-[8px] uppercase tracking-wider text-slate-400 block">
                              Expira
                            </span>
                            <span className="font-mono font-bold text-[11px]">
                              {card.expiryMonth}/{card.expiryYear}
                            </span>
                          </div>
                        </div>

                        {/* Acciones de Tarjeta */}
                        <div className="pt-3 mt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                          {!card.isDefault ? (
                            <button
                              type="button"
                              onClick={() => setDefaultCard(card.id)}
                              className="text-slate-300 hover:text-white font-medium hover:underline flex items-center gap-1 transition"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              Hacer Predeterminada
                            </button>
                          ) : (
                            <span className="text-emerald-400 text-[10px] font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Tarjeta de cobro principal
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`¿Eliminar la tarjeta ${card.bankName} terminada en ${card.last4}?`)) {
                                deleteSavedCard(card.id);
                              }
                            }}
                            className="text-rose-300 hover:text-rose-100 p-1 rounded-lg hover:bg-white/10 transition flex items-center gap-1 text-[10px]"
                            title="Eliminar tarjeta"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Banner Informativo sobre Tokenización */}
              <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-800 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      Tokenización Bancaria y Cumplimiento Normativo Chileno
                    </h4>
                    <p className="text-xs text-slate-400">
                      Tus números completos de tarjeta y CVV nunca se almacenan en servidores abiertos.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  En cumplimiento con la normativa de la Comisión para el Mercado Financiero (CMF) y los estándares de seguridad de Webpay Plus Transbank, cada tarjeta registrada genera un token criptográfico único. Las garantías de arriendo quedan en retención temporal y se liberan de forma automática una vez concluido el arriendo sin observaciones.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: COMPROBANTES Y PAGOS */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              {myPayments.length === 0 ? (
                <div className="bg-white rounded-3xl p-10 text-center space-y-4 border border-slate-200">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                    <FileText className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">Aún no registras pagos formalizados</h3>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                    Cuando reserves un espacio mediante tu tarjeta, aquí podrás consultar tus comprobantes de venta oficiales Webpay y los folios de custodia de garantía.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('home')}
                    className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-2"
                  >
                    Explorar Espacios Disponibles
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden">
                  <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Historial de Transacciones y Vouchers Webpay
                      </h3>
                      <p className="text-xs text-slate-500">
                        Visualiza el desglose financiero, comisiones y vouchers autorizados.
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                      {myPayments.length} {myPayments.length === 1 ? 'Transacción' : 'Transacciones'}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {myPayments.map((res) => {
                      const p = res.paymentSimulation!;
                      return (
                        <div
                          key={res.id}
                          className="p-5 sm:p-6 hover:bg-slate-50 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                        >
                          <div className="flex items-start gap-4">
                            <img
                              src={res.spaceImage}
                              alt={res.spaceTitle}
                              className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shrink-0"
                            />
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">
                                  {res.spaceTitle}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Pagado • Aprobado
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 flex items-center gap-1">
                                <span>{res.spaceAddress}</span>
                                <span>•</span>
                                <span>{new Date(p.paidAt).toLocaleDateString('es-CL')}</span>
                              </p>
                              <div className="text-[11px] text-slate-600 flex items-center gap-2 pt-0.5">
                                <span className="font-mono font-medium text-slate-700">
                                  {p.cardBrand.toUpperCase()} •••• {p.last4}
                                </span>
                                <span>•</span>
                                <span className="font-mono text-slate-500">
                                  Auth: #{p.authorizationCode}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between md:justify-end gap-6 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                            <div className="text-right">
                              <div className="text-xs text-slate-400">Monto Total CLP</div>
                              <div className="text-base sm:text-lg font-bold text-slate-900">
                                {formatClp(res.totalClp)}
                              </div>
                              <div className="text-[10px] text-emerald-600 font-medium">
                                Incluye garantía {formatClp(res.securityDepositClp)}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setSelectedVoucher(res)}
                              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Ver Voucher
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: INFORMACIÓN LEGAL Y GARANTÍAS LEY 18.101 */}
          {activeTab === 'legal' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xs border border-slate-200 space-y-4">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  Marco Legal de Garantías (Ley N° 18.101)
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  En el ordenamiento jurídico chileno, la garantía de arriendo tiene como único fin indemnizar eventuales deterioros culpables o consumos pendientes ocasionados durante el período de tenencia material del inmueble.
                </p>
                <div className="space-y-2 pt-2 text-xs text-slate-700">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Custodia Neutral:</strong> Spotly retiene el depósito de garantía en una cuenta de depósito neutral hasta la recepción conforme del recinto.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Plazo de Restitución:</strong> Si el anfitrión no ingresa un acta de daños fundada dentro de las 48 horas post check-out, la garantía se libera automáticamente a la tarjeta de origen.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Resolución Arbitral:</strong> En caso de discrepancias, un panel arbitral calificado de Spotly revisa fotografías comparativas previas y posteriores.</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xs border border-slate-200 space-y-4">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                  <CreditCard className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  Métodos de Pago Aceptados en Chile
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Spotly opera integrado directamente con la infraestructura nacional de medios de pago para garantizar disponibilidad y protección al consumidor financiero.
                </p>
                <div className="space-y-3 pt-2 text-xs text-slate-600">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="font-bold text-slate-900">Tarjetas de Crédito Bancarias</div>
                    <div className="text-[11px] mt-0.5">Visa, Mastercard y American Express emitidas por bancos chilenos. Permite diferir el arriendo en hasta 6 cuotas.</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="font-bold text-slate-900">Tarjetas de Débito y Redcompra</div>
                    <div className="text-[11px] mt-0.5">Cargo directo contra saldos de Cuenta Corriente, Cuenta Vista o CuentaRUT de BancoEstado.</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="font-bold text-slate-900">Tarjetas de Prepago Digital</div>
                    <div className="text-[11px] mt-0.5">Soporte total para cuentas de pago con provisión de fondos reguladas (Tenpo, MACH, etc.).</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL: AÑADIR NUEVA TARJETA BANCARIA */}
      {isAddCardModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 animate-fadeIn my-6">
            <div className="bg-slate-900 text-white p-6 relative">
              <button
                type="button"
                onClick={() => setIsAddCardModalOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-full hover:bg-slate-800 transition"
              >
                ✕
              </button>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  Tokenización Bancaria
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Webpay Plus</span>
              </div>
              <h2 className="text-xl font-bold">Registrar Tarjeta de Pago</h2>
              <p className="text-xs text-slate-400 mt-1">
                Ingresa una tarjeta chilena para tus arriendos y depósitos de garantía.
              </p>
            </div>

            <form onSubmit={handleSaveNewCard} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {cardError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{cardError}</span>
                </div>
              )}

              {/* BANCO EMISOR */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Banco o Institución Emisora <span className="text-rose-500">*</span>
                </label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                >
                  {CHILEAN_BANKS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              {/* TIPO DE FRANQUICIA */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Franquicia de la Tarjeta <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['visa', 'mastercard', 'redcompra'] as const).map((brand) => (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => setCardBrand(brand)}
                      className={`p-2.5 rounded-xl border text-xs font-bold uppercase transition flex items-center justify-center gap-1.5 ${
                        cardBrand === brand
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {cardBrand === brand && <Check className="w-3.5 h-3.5 text-rose-400" />}
                      {brand === 'redcompra' ? 'Redcompra' : brand.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* NÚMERO DE TARJETA */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Número de Tarjeta (16 dígitos) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={19}
                  required
                  placeholder="4500 0000 0000 0000"
                  value={cardNumber}
                  onChange={(e) => handleCardNumberInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>

              {/* TITULAR */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre del Titular (Como figura en plástico) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. MATIAS SILVA CONTRERAS"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs uppercase bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden font-semibold"
                />
              </div>

              {/* VENCIMIENTO Y CVV */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Vencimiento (MM/AA) <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={expiryMonth}
                      onChange={(e) => setExpiryMonth(e.target.value)}
                      className="w-1/2 px-2.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono text-center font-bold"
                    >
                      {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <span className="text-slate-400 font-bold">/</span>
                    <select
                      value={expiryYear}
                      onChange={(e) => setExpiryYear(e.target.value)}
                      className="w-1/2 px-2.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono text-center font-bold"
                    >
                      {['26', '27', '28', '29', '30', '31', '32', '33', '34'].map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Código CVV / CVC <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    placeholder="892"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* CHECKBOX PREDETERMINADA */}
              <label className="flex items-start gap-2.5 pt-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                />
                <span className="text-xs text-slate-700 font-medium">
                  Establecer como mi tarjeta predeterminada para futuras reservas
                </span>
              </label>

              {/* BOTONES */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddCardModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Guardar Tarjeta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VER COMPROBANTE OFICIAL WEBPAY TRANSBANK */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 animate-fadeIn my-6">
            {/* Cabecera del Voucher */}
            <div className="bg-slate-900 text-white p-6 relative text-center">
              <button
                type="button"
                onClick={() => setSelectedVoucher(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-full hover:bg-slate-800 transition"
              >
                ✕
              </button>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold">Comprobante de Pago Webpay</h3>
              <p className="text-[11px] text-slate-400">
                Transbank S.A. • Comercio: Spotly SpA (76.892.411-K)
              </p>
            </div>

            {/* Contenido del Voucher */}
            <div className="p-6 space-y-4 font-mono text-xs text-slate-700 max-h-[70vh] overflow-y-auto">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">ID Reserva:</span>
                  <span className="font-bold text-slate-900">{selectedVoucher.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Código Autorización:</span>
                  <span className="font-bold text-emerald-700">
                    {selectedVoucher.paymentSimulation?.authorizationCode}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Folio Transacción:</span>
                  <span className="font-bold text-slate-900">
                    {selectedVoucher.paymentSimulation?.transactionCode}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fecha y Hora:</span>
                  <span>{new Date(selectedVoucher.paymentSimulation?.paidAt).toLocaleString('es-CL')}</span>
                </div>
              </div>

              <div className="space-y-1.5 border-t border-b border-dashed border-slate-300 py-3">
                <div className="flex justify-between text-slate-600">
                  <span>Recinto:</span>
                  <span className="font-bold text-slate-900 text-right max-w-[200px] truncate">
                    {selectedVoucher.spaceTitle}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Ubicación:</span>
                  <span className="text-right">{selectedVoucher.spaceAddress}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Días de Arriendo:</span>
                  <span>{selectedVoucher.totalDays} {selectedVoucher.totalDays === 1 ? 'día' : 'días'}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Arrendatario:</span>
                  <span className="font-bold">{selectedVoucher.tenantName}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>RUT:</span>
                  <span>{formatRut(selectedVoucher.tenantRut)}</span>
                </div>
              </div>

              {/* Desglose de Montos */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal Arriendo:</span>
                  <span className="font-bold">{formatClp(selectedVoucher.subtotalClp)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Comisión Spotly (5%):</span>
                  <span>{formatClp(selectedVoucher.platformFeeClp)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Garantía en Custodia (Ley 18.101):</span>
                  <span>{formatClp(selectedVoucher.securityDepositClp)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>TOTAL COBRADO:</span>
                  <span className="text-rose-600">{formatClp(selectedVoucher.totalClp)}</span>
                </div>
              </div>

              {/* Datos de la Tarjeta */}
              <div className="p-3 bg-slate-100 rounded-xl text-[11px] space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>Tarjeta:</span>
                  <span className="font-bold text-slate-800">
                    {selectedVoucher.paymentSimulation?.cardBrand.toUpperCase()} •••• {selectedVoucher.paymentSimulation?.last4}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Modalidad:</span>
                  <span>
                    {selectedVoucher.paymentSimulation?.installments === 1
                      ? '1 Cuota Contado / Débito'
                      : `${selectedVoucher.paymentSimulation?.installments} Cuotas`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Estado:</span>
                  <span className="font-bold text-emerald-700">TRANSACCIÓN APROBADA</span>
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleCopyFolio(selectedVoucher.paymentSimulation?.transactionCode || '')}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white transition flex items-center gap-1.5"
              >
                {copiedFolio ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedFolio ? '¡Copiado!' : 'Copiar Folio'}
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir Comprobante
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
