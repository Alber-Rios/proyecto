import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, CreditCard, Info, Loader2, Plus, ShieldCheck, Star, Trash2, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { formatClp } from '../utils/formatters.ts';
import type { PaymentRecord } from '../types.ts';

interface WalletPageProps {
  onOpenAuth: (mode: 'login' | 'register', notice?: string) => void;
}

const STATUS_LABEL: Record<PaymentRecord['status'], { text: string; className: string }> = {
  created: { text: 'En proceso', className: 'bg-slate-100 text-slate-700' },
  authorized: { text: 'Pagado', className: 'bg-emerald-50 text-emerald-700' },
  failed: { text: 'Rechazado', className: 'bg-red-50 text-red-700' },
  aborted: { text: 'Anulado', className: 'bg-slate-100 text-slate-600' },
  refunded: { text: 'Reembolsado', className: 'bg-red-50 text-red-700' },
  partially_refunded: { text: 'Reembolso parcial', className: 'bg-red-50 text-red-700' },
};

const RESULT_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: 'Tarjeta agregada a tu billetera.' },
  rechazada: { ok: false, text: 'Transbank no pudo inscribir la tarjeta o cancelaste el proceso. No se guardó nada.' },
  error: { ok: false, text: 'No se pudo completar la inscripción. Inténtalo nuevamente.' },
};

export const WalletPage: React.FC<WalletPageProps> = ({ onOpenAuth }) => {
  const { currentUser, walletCards, payments, reservations, addWalletCard, removeWalletCard, setDefaultWalletCard, refreshWalletCards } =
    useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

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
          <Wallet className="w-10 h-10 text-brand-600 mx-auto" />
          <h1 className="text-xl font-semibold text-slate-900">Tu billetera</h1>
          <p className="text-sm text-slate-600">Inicia sesión para guardar tarjetas y pagar tus reservas en un clic.</p>
          <button
            type="button"
            onClick={() => onOpenAuth('login', 'Inicia sesión para ver tu billetera.')}
            className="px-6 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold cursor-pointer"
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

  return (
    <div className="max-w-3xl mx-auto py-8 sm:py-12 px-4 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-brand-600" /> Billetera
          </h1>
          <p className="text-sm text-slate-600 mt-1">Guarda tus tarjetas para pagar las reservas sin volver a ingresar los datos.</p>
        </div>
        <button
          type="button"
          onClick={() => run('add', () => addWalletCard('/billetera'))}
          disabled={busy !== null || walletCards.length >= 5}
          className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
        >
          {busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Agregar tarjeta
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className={`p-3.5 rounded-2xl border text-sm font-semibold flex items-center gap-2 ${
            notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {notice.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {notice.text}
        </div>
      )}
      {error && (
        <div role="alert" className="p-3.5 rounded-2xl border bg-red-50 border-red-200 text-red-800 text-sm font-semibold">
          {error}
        </div>
      )}

      <section className="space-y-3" aria-labelledby="mis-tarjetas">
        <h2 id="mis-tarjetas" className="text-sm font-semibold text-slate-900">
          Mis tarjetas
        </h2>
        {walletCards.length === 0 ? (
          <div className="p-6 rounded-2xl border border-dashed border-slate-300 bg-white text-center text-sm text-slate-600">
            Aún no tienes tarjetas guardadas. Agrega una para pagar tus reservas en un clic.
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {walletCards.map((card) => (
              <li key={card.id} className="p-4 rounded-2xl bg-slate-900 text-white space-y-4 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <CreditCard className="w-5 h-5 text-brand-300" /> {card.cardType}
                  </span>
                  {card.isDefault && (
                    <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      Predeterminada
                    </span>
                  )}
                </div>
                <p className="font-mono text-lg tracking-widest">•••• •••• •••• {card.last4}</p>
                <div className="flex items-center gap-2">
                  {!card.isDefault && (
                    <button
                      type="button"
                      onClick={() => run(`def-${card.id}`, () => setDefaultWalletCard(card.id))}
                      disabled={busy !== null}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1 cursor-pointer"
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
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-semibold cursor-pointer"
                      >
                        {busy === `del-${card.id}` ? 'Eliminando…' : 'Sí, eliminar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="px-3 py-1.5 rounded-lg bg-white/10 text-xs font-semibold cursor-pointer"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(card.id)}
                      disabled={busy !== null}
                      className="ml-auto px-3 py-1.5 rounded-lg bg-white/10 hover:bg-red-600 text-xs font-semibold flex items-center gap-1 cursor-pointer"
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
        <p className="text-xs text-slate-500 flex items-start gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          Las tarjetas se inscriben en Transbank (Oneclick). Spotly nunca ve ni guarda el número completo de tu tarjeta.
        </p>
        <div className="p-3 rounded-xl bg-brand-50 border border-brand-200 text-[12.5px] text-brand-900 flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Ambiente de pruebas de Transbank: usa la tarjeta VISA <strong>4051 8856 0044 6623</strong>, CVV <strong>123</strong> y cualquier fecha
            futura; si te pide autenticación, RUT <strong>11.111.111-1</strong> y clave <strong>123</strong>.
          </span>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="movimientos">
        <h2 id="movimientos" className="text-sm font-semibold text-slate-900">
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
                    <p className="font-semibold text-slate-900">{formatClp(p.amountClp)}</p>
                    <span className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full ${label.className}`}>{label.text}</span>
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
