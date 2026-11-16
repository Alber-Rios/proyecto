import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, CreditCard, ExternalLink, Info, Landmark, Loader2, Plus, ShieldCheck, Star, Trash2, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { formatClp } from '../utils/formatters.ts';
import type { PaymentRecord } from '../types.ts';
import { BankAccountCard } from '../components/BankAccountCard.tsx';
import { getMyRefundTransfers, type RefundTransfer } from '../lib/financeApi.ts';

interface WalletPageProps {
  onOpenAuth: (mode: 'login' | 'register', notice?: string) => void;
  /** Dentro del panel: sin título propio ni márgenes de página. */
  embedded?: boolean;
}

const STATUS_LABEL: Record<PaymentRecord['status'], { text: string; className: string }> = {
  created: { text: 'En proceso', className: 'bg-slate-100 text-slate-700' },
  authorized: { text: 'Pagado', className: 'bg-emerald-50 text-emerald-700' },
  failed: { text: 'Rechazado', className: 'bg-rose-50 text-rose-700' },
  aborted: { text: 'Anulado', className: 'bg-slate-100 text-slate-600' },
  refunded: { text: 'Reembolsado', className: 'bg-indigo-50 text-indigo-700' },
  partially_refunded: { text: 'Reembolso parcial', className: 'bg-indigo-50 text-indigo-700' },
};

const RESULT_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: 'Tarjeta agregada a tu billetera.' },
  rechazada: { ok: false, text: 'Transbank no pudo inscribir la tarjeta o cancelaste el proceso. No se guardó nada.' },
  error: { ok: false, text: 'No se pudo completar la inscripción. Inténtalo nuevamente.' },
};

export const WalletPage: React.FC<WalletPageProps> = ({ onOpenAuth, embedded = false }) => {
  const { currentUser, walletCards, payments, reservations, addWalletCard, removeWalletCard, setDefaultWalletCard, refreshWalletCards } =
    useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmAdd, setConfirmAdd] = useState(false);
  const [refunds, setRefunds] = useState<RefundTransfer[]>([]);
  const loadRefunds = () => void getMyRefundTransfers().then(setRefunds);
  useEffect(loadRefunds, [currentUser?.id]);
  const waitingData = refunds.filter((r) => r.status === 'awaiting_data');

  useEffect(() => {
    const result = searchParams.get('tarjeta');
    if (result) {
      setNotice(RESULT_MESSAGES[result] || RESULT_MESSAGES.error);
      refreshWalletCards();
      searchParams.delete('tarjeta');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  const myPayments = useMemo(
    () => (currentUser ? payments.filter((p) => reservations.some((r) => r.id === p.reservationId && r.tenantId === currentUser.id)) : []),
    [payments, reservations, currentUser]
  );

  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4 shadow-sm">
          <Wallet className="w-10 h-10 text-rose-600 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900">Tu billetera</h1>
          <p className="text-sm text-slate-600">Inicia sesión para guardar tarjetas y pagar tus reservas en un clic.</p>
          <button
            type="button"
            onClick={() => onOpenAuth('login', 'Inicia sesión para ver tu billetera.')}
            className="px-6 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold cursor-pointer"
          >
            Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(null);
    }
  };

  const isOwner = currentUser.role === 'owner' || !!currentUser.ownerTermsAccepted;
  const maxCards = walletCards.length >= 5;

  const addCardButton = (
    <button
      type="button"
      onClick={() => setConfirmAdd(true)}
      disabled={busy !== null || maxCards || confirmAdd}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white transition hover:bg-rose-700 active:scale-[0.97] disabled:opacity-50 cursor-pointer"
    >
      <Plus className="h-4 w-4" aria-hidden="true" /> Agregar tarjeta
    </button>
  );

  return (
    <div className={embedded ? 'max-w-3xl space-y-8' : 'max-w-3xl mx-auto py-8 sm:py-12 px-4 space-y-8'}>
      <header>
        {!embedded && (
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-rose-600" aria-hidden="true" /> Billetera
          </h1>
        )}
        <p className={`text-sm text-slate-600 ${embedded ? '' : 'mt-1'}`}>
          {isOwner
            ? 'Aquí manejas tu plata en Spotly: con qué pagas cuando arriendas y dónde te depositamos lo que ganas.'
            : 'Aquí manejas con qué pagas tus reservas y dónde te devolvemos dinero si hace falta.'}
        </p>
        <nav aria-label="Secciones de la billetera" className="mt-4 grid grid-cols-2 gap-2 sm:max-w-md">
          <a href="#para-pagar" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50">
            <CreditCard className="h-4 w-4 text-rose-600" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block">Para pagar</span>
              <span className="block text-xs font-normal text-slate-500">{walletCards.length ? `${walletCards.length} tarjeta${walletCards.length > 1 ? 's' : ''}` : 'Sin tarjetas'}</span>
            </span>
          </a>
          <a href="#para-recibir" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50">
            <Landmark className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block">Para recibir</span>
              <span className="block text-xs font-normal text-slate-500">Cuenta bancaria</span>
            </span>
          </a>
        </nav>
      </header>

      {notice && (
        <div
          role="status"
          className={`p-3.5 rounded-2xl border text-sm font-semibold flex items-center gap-2 ${
            notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {notice.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {notice.text}
        </div>
      )}
      {error && (
        <div role="alert" className="p-3.5 rounded-2xl border bg-rose-50 border-rose-200 text-rose-800 text-sm font-semibold">
          {error}
        </div>
      )}

      {waitingData.length > 0 && (
        <a href="#para-recibir" role="status" className="block rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-bold">
            Tienes {waitingData.length === 1 ? 'una devolución' : `${waitingData.length} devoluciones`} de{' '}
            {formatClp(waitingData.reduce((n, r) => n + r.amountClp, 0))} esperando tus datos bancarios
          </p>
          <p>No pudimos devolverla a tu tarjeta. Completa tu cuenta bancaria más abajo y te la transferimos.</p>
        </a>
      )}

      {/* ---------- 1. Para pagar ---------- */}
      <section id="para-pagar" className="scroll-mt-24 space-y-3" aria-labelledby="mis-tarjetas">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-rose-600">1 · Para pagar</p>
            <h2 id="mis-tarjetas" className="text-lg font-bold text-slate-950">Mis tarjetas</h2>
            <p className="text-sm text-slate-600">Paga tus reservas en un clic, sin volver a escribir los datos.</p>
          </div>
          {walletCards.length > 0 && !confirmAdd && addCardButton}
        </div>

        {confirmAdd && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" role="region" aria-labelledby="add-card-title">
            <h3 id="add-card-title" className="text-base font-bold text-slate-950">Vas a agregar tu tarjeta en Transbank</h3>
            <p className="mt-1 text-sm text-slate-600">
              Por seguridad, la tarjeta no se escribe en Spotly: se inscribe en la página oficial de Transbank (Webpay Oneclick).
            </p>
            <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              {[
                ['Te llevamos a Webpay', 'Se abre la página segura de Transbank.'],
                ['Ingresas tu tarjeta', 'Número, fecha y clave, solo en Transbank.'],
                ['Vuelves a Spotly', 'La tarjeta aparece aquí, lista para pagar.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3 rounded-xl bg-slate-50 p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{i + 1}</span>
                  <span>
                    <span className="block font-semibold text-slate-900">{t}</span>
                    <span className="text-slate-600">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-600">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              Spotly solo guarda el tipo de tarjeta y los 4 últimos dígitos. No se hace ningún cobro al inscribirla.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => run('add', () => addWalletCard('/billetera'))}
                disabled={busy !== null}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white transition hover:bg-rose-700 active:scale-[0.97] disabled:opacity-60 cursor-pointer"
              >
                {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-4 w-4" aria-hidden="true" />}
                {busy === 'add' ? 'Abriendo Transbank…' : 'Continuar a Transbank'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmAdd(false)}
                disabled={busy === 'add'}
                className="min-h-11 rounded-xl px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Ahora no
              </button>
            </div>
          </div>
        )}

        {walletCards.length === 0 ? (
          !confirmAdd && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                <CreditCard className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="text-sm text-slate-600">Aún no tienes tarjetas guardadas.</p>
              {addCardButton}
            </div>
          )
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {walletCards.map((card) => (
              <li key={card.id} className="p-4 rounded-2xl bg-slate-900 text-white space-y-4 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <CreditCard className="w-5 h-5 text-rose-300" /> {card.cardType}
                  </span>
                  {card.isDefault && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      Predeterminada
                    </span>
                  )}
                </div>
                <p className="font-mono text-lg">•••• •••• •••• {card.last4}</p>
                <div className="flex items-center gap-2">
                  {!card.isDefault && (
                    <button
                      type="button"
                      onClick={() => run(`def-${card.id}`, () => setDefaultWalletCard(card.id))}
                      disabled={busy !== null}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Star className="w-3.5 h-3.5" /> Usar por defecto
                    </button>
                  )}
                  {confirmDelete === card.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => run(`del-${card.id}`, () => removeWalletCard(card.id)).then(() => setConfirmDelete(null))}
                        disabled={busy !== null}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-xs font-bold cursor-pointer"
                      >
                        {busy === `del-${card.id}` ? 'Eliminando…' : 'Sí, eliminar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="px-3 py-1.5 rounded-lg bg-white/10 text-xs font-bold cursor-pointer"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(card.id)}
                      disabled={busy !== null}
                      className="ml-auto px-3 py-1.5 rounded-lg bg-white/10 hover:bg-rose-600 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      aria-label={`Eliminar tarjeta terminada en ${card.last4}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {maxCards && <p className="text-xs text-slate-500">Puedes guardar hasta 5 tarjetas. Elimina una para agregar otra.</p>}
        <details className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          <summary className="flex cursor-pointer items-center gap-2 font-semibold">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" /> Datos de prueba de Transbank (ambiente de integración)
          </summary>
          <p className="mt-2">
            Tarjeta VISA <strong>4051 8856 0044 6623</strong>, CVV <strong>123</strong> y cualquier fecha futura. Si te pide autenticación: RUT{' '}
            <strong>11.111.111-1</strong> y clave <strong>123</strong>.
          </p>
        </details>
      </section>

      {/* ---------- 2. Para recibir ---------- */}
      <section id="para-recibir" className="scroll-mt-24 space-y-3" aria-labelledby="para-recibir-t">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">2 · Para recibir</p>
          <h2 id="para-recibir-t" className="text-lg font-bold text-slate-950">Tu cuenta bancaria</h2>
          <p className="text-sm text-slate-600">
            {isOwner
              ? 'Cada martes te transferimos aquí lo que ganaste con los arriendos terminados.'
              : 'Solo la usamos si una devolución no puede volver a tu tarjeta.'}
          </p>
        </div>
        <BankAccountCard
          userId={currentUser.id}
          defaultName={currentUser.fullName}
          defaultRut={currentUser.rut}
          defaultEmail={currentUser.email}
          highlight={waitingData.length > 0}
          purpose={isOwner ? 'Depósitos de los martes y devoluciones.' : 'Devoluciones por transferencia.'}
          onSaved={loadRefunds}
        />
        {refunds.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900">Devoluciones por transferencia</h3>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {refunds.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  <span className="block font-semibold text-slate-900">{formatClp(r.amountClp)}</span>
                  <span className="text-xs text-slate-500">
                    Reserva {r.reservationId} · {new Date(r.createdAt).toLocaleDateString('es-CL')}
                    {r.transferReference ? ` · comprobante ${r.transferReference}` : ''}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    r.status === 'paid'
                      ? 'bg-emerald-50 text-emerald-800'
                      : r.status === 'awaiting_data'
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {r.status === 'paid' ? 'Transferida' : r.status === 'awaiting_data' ? 'Faltan tus datos' : r.status === 'pending' ? 'Por transferir' : 'Anulada'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      </section>

      <section className="space-y-3" aria-labelledby="movimientos">
        <h2 id="movimientos" className="text-lg font-bold text-slate-950">
          Movimientos
        </h2>
        {myPayments.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no tienes pagos registrados.</p>
        ) : (
          <ul className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {myPayments.slice(0, 20).map((p) => {
              const res = reservations.find((r) => r.id === p.reservationId);
              const label = STATUS_LABEL[p.status] || STATUS_LABEL.created;
              return (
                <li key={p.id} className="p-3.5 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{res?.spaceTitle || 'Reserva'}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(p.transactionDate || p.createdAt).toLocaleDateString('es-CL')} ·{' '}
                      {p.provider === 'oneclick_mall' ? 'Tarjeta guardada' : 'Webpay'}
                      {p.cardLast4 ? ` ···· ${p.cardLast4}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-slate-900">{formatClp(p.amountClp)}</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${label.className}`}>{label.text}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
