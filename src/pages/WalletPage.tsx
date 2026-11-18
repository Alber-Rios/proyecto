import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Landmark,
  Loader2,
  Plus,
  ReceiptText,
  ShieldCheck,
  Star,
  Trash2,
  Undo2,
  Wallet,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { formatClp } from '../utils/formatters.ts';
import type { PaymentRecord, Reservation, WalletCard } from '../types.ts';
import { BankAccountCard } from '../components/BankAccountCard.tsx';
import { PaymentReceiptModal } from '../components/PaymentReceipt.tsx';
import {
  accountTypeLabel,
  getMyBankAccount,
  getMyRefundTransfers,
  maskAccount,
  type BankAccount,
  type RefundTransfer,
} from '../lib/financeApi.ts';

// Billetera al estilo de las apps de transporte: listas simples de filas
// (ícono · título · subtítulo · flecha). Los detalles se abren en una hoja.

interface WalletPageProps {
  onOpenAuth: (mode: 'login' | 'register', notice?: string) => void;
  /** Dentro del panel: sin título propio ni márgenes de página. */
  embedded?: boolean;
}

const STATUS_LABEL: Record<PaymentRecord['status'], { text: string; className: string }> = {
  created: { text: 'En proceso', className: 'text-slate-500' },
  authorized: { text: 'Pagado', className: 'text-emerald-700' },
  failed: { text: 'Rechazado', className: 'text-rose-700' },
  aborted: { text: 'Anulado', className: 'text-slate-500' },
  refunded: { text: 'Reembolsado', className: 'text-indigo-700' },
  partially_refunded: { text: 'Reembolso parcial', className: 'text-indigo-700' },
};

const RESULT_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: 'Tarjeta agregada.' },
  rechazada: { ok: false, text: 'Transbank no pudo inscribir la tarjeta o cancelaste el proceso. No se guardó nada.' },
  error: { ok: false, text: 'No se pudo agregar la tarjeta. Inténtalo de nuevo.' },
};

type SheetState =
  | { kind: 'add' }
  | { kind: 'card'; card: WalletCard }
  | { kind: 'bank' }
  | null;

/* ---------- Piezas de la lista ---------- */

const BrandBadge: React.FC<{ type: string }> = ({ type }) => {
  const t = type.toLowerCase();
  if (t.includes('visa'))
    return (
      <span className="flex h-9 w-12 items-center justify-center rounded-lg bg-[#1a3fd6] text-[11px] font-black italic tracking-tight text-white">
        VISA
      </span>
    );
  if (t.includes('master'))
    return (
      <span className="relative flex h-9 w-12 items-center justify-center rounded-lg bg-slate-900" aria-hidden="true">
        <span className="absolute left-[11px] h-4 w-4 rounded-full bg-[#eb001b]" />
        <span className="absolute left-[19px] h-4 w-4 rounded-full bg-[#f79e1b]/90" />
      </span>
    );
  if (t.includes('amex') || t.includes('american'))
    return <span className="flex h-9 w-12 items-center justify-center rounded-lg bg-[#2e77bc] text-[10px] font-black text-white">AMEX</span>;
  return (
    <span className="flex h-9 w-12 items-center justify-center rounded-lg bg-slate-200 text-slate-700">
      <CreditCard className="h-5 w-5" aria-hidden="true" />
    </span>
  );
};

const IconTile: React.FC<{ className: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={`flex h-9 w-12 shrink-0 items-center justify-center rounded-lg ${className}`}>{children}</span>
);

const Row: React.FC<{
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  subtitleClass?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}> = ({ icon, title, subtitle, subtitleClass = 'text-slate-500', right, onClick, ariaLabel }) => {
  const content = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-slate-950">{title}</span>
        {subtitle && <span className={`block truncate text-sm ${subtitleClass}`}>{subtitle}</span>}
      </span>
      {right}
      {onClick && <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />}
    </>
  );
  return (
    <li className="border-b border-slate-100 last:border-b-0">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel}
          className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-center gap-4 px-4 py-3.5">{content}</div>
      )}
    </li>
  );
};

const SectionTitle: React.FC<{ id: string; children: React.ReactNode; hint?: string }> = ({ id, children, hint }) => (
  <div className="px-1">
    <h2 id={id} className="text-xl font-bold tracking-tight text-slate-950">
      {children}
    </h2>
    {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
  </div>
);

const PillButton: React.FC<{ onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ onClick, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="inline-flex min-h-12 items-center gap-3 rounded-full bg-slate-100 px-5 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-200 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
  >
    {children}
  </button>
);

/* ---------- Hoja (abajo en celular, centrada en escritorio) ---------- */

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-white pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-3xl sm:pb-5"
        initial={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
        animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1 }}
        exit={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
        transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
          <h3 id={titleId} className="text-lg font-bold text-slate-950">
            {title}
          </h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="px-5">{children}</div>
      </motion.div>
    </motion.div>,
    document.body,
  );
};

/* ---------- Página ---------- */

export const WalletPage: React.FC<WalletPageProps> = ({ onOpenAuth, embedded = false }) => {
  const { currentUser, walletCards, payments, reservations, addWalletCard, removeWalletCard, setDefaultWalletCard, refreshWalletCards } =
    useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [receiptFor, setReceiptFor] = useState<Reservation | null>(null);
  const [refunds, setRefunds] = useState<RefundTransfer[]>([]);
  const [bank, setBank] = useState<BankAccount | null | undefined>(undefined);

  const loadRefunds = () => void getMyRefundTransfers().then(setRefunds);
  useEffect(loadRefunds, [currentUser?.id]);
  useEffect(() => {
    if (currentUser) getMyBankAccount(currentUser.id).then(setBank).catch(() => setBank(null));
  }, [currentUser?.id]);
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
    [payments, reservations, currentUser],
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
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const isOwner = currentUser.role === 'owner' || !!currentUser.ownerTermsAccepted;
  const maxCards = walletCards.length >= 5;
  const closeSheet = () => {
    setSheet(null);
    setConfirmDelete(false);
  };

  return (
    <div className={embedded ? 'max-w-2xl space-y-8' : 'max-w-2xl mx-auto py-8 sm:py-12 px-4 space-y-8'}>
      {!embedded && <h1 className="text-3xl font-bold tracking-tight text-slate-950">Billetera</h1>}

      {notice && (
        <div
          role="status"
          className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ${
            notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
          }`}
        >
          {notice.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {notice.text}
        </div>
      )}
      {error && !sheet && (
        <div role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      )}

      {/* ---------- Métodos de pago ---------- */}
      <section className="space-y-3" aria-labelledby="w-pay">
        <SectionTitle id="w-pay">Métodos de pago</SectionTitle>
        {walletCards.length > 0 && (
          <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {walletCards.map((card) => (
              <Row
                key={card.id}
                icon={<BrandBadge type={card.cardType} />}
                title={`${card.cardType} ••••${card.last4}`}
                subtitle={card.isDefault ? 'Predeterminada' : 'Toca para ver opciones'}
                subtitleClass={card.isDefault ? 'text-blue-600' : 'text-slate-500'}
                onClick={() => setSheet({ kind: 'card', card })}
                ariaLabel={`Tarjeta ${card.cardType} terminada en ${card.last4}${card.isDefault ? ', predeterminada' : ''}`}
              />
            ))}
          </ul>
        )}
        <PillButton onClick={() => setSheet({ kind: 'add' })} disabled={maxCards || busy !== null}>
          <Plus className="h-5 w-5" aria-hidden="true" /> Agrega un método de pago
        </PillButton>
        {maxCards && <p className="px-1 text-sm text-slate-500">Puedes guardar hasta 5 tarjetas.</p>}
      </section>

      {/* ---------- Para recibir dinero ---------- */}
      <section className="space-y-3" aria-labelledby="w-receive">
        <SectionTitle id="w-receive">Para recibir dinero</SectionTitle>
        <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <Row
            icon={
              <IconTile className="bg-emerald-100 text-emerald-800">
                <Landmark className="h-5 w-5" aria-hidden="true" />
              </IconTile>
            }
            title={bank ? bank.bank : 'Cuenta bancaria'}
            subtitle={
              bank === undefined
                ? 'Cargando…'
                : bank
                  ? `${accountTypeLabel(bank.accountType)} ${maskAccount(bank.accountNumber)}`
                  : waitingData.length
                    ? 'Agrégala para recibir tu devolución'
                    : isOwner
                      ? 'Agrégala para recibir tus depósitos del martes'
                      : 'Agrégala por si te devolvemos dinero'
            }
            subtitleClass={!bank && bank !== undefined ? 'text-blue-600' : 'text-slate-500'}
            onClick={() => setSheet({ kind: 'bank' })}
          />
          {refunds.map((r) => (
            <Row
              key={r.id}
              icon={
                <IconTile className="bg-indigo-100 text-indigo-800">
                  <Undo2 className="h-5 w-5" aria-hidden="true" />
                </IconTile>
              }
              title={`Devolución ${formatClp(r.amountClp)}`}
              subtitle={
                r.status === 'paid'
                  ? `Transferida${r.transferReference ? ` · comprobante ${r.transferReference}` : ''}`
                  : r.status === 'awaiting_data'
                    ? 'Faltan tus datos bancarios'
                    : r.status === 'pending'
                      ? 'Por transferir'
                      : 'Anulada'
              }
              subtitleClass={r.status === 'awaiting_data' ? 'text-amber-700' : r.status === 'paid' ? 'text-emerald-700' : 'text-slate-500'}
              onClick={r.status === 'awaiting_data' ? () => setSheet({ kind: 'bank' }) : undefined}
            />
          ))}
        </ul>
      </section>

      {/* ---------- Movimientos ---------- */}
      <section className="space-y-3" aria-labelledby="w-moves">
        <SectionTitle id="w-moves">Movimientos</SectionTitle>
        {myPayments.length === 0 ? (
          <p className="px-1 text-sm text-slate-500">Todavía no tienes pagos.</p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {myPayments.slice(0, 20).map((p) => {
              const res = reservations.find((r) => r.id === p.reservationId);
              const label = STATUS_LABEL[p.status] || STATUS_LABEL.created;
              const canOpen = res && ['authorized', 'refunded', 'partially_refunded'].includes(p.status);
              return (
                <Row
                  key={p.id}
                  icon={
                    <IconTile className="bg-slate-100 text-slate-700">
                      <ReceiptText className="h-5 w-5" aria-hidden="true" />
                    </IconTile>
                  }
                  title={res?.spaceTitle || 'Reserva'}
                  subtitle={
                    <>
                      {new Date(p.transactionDate || p.createdAt).toLocaleDateString('es-CL')}
                      {p.cardLast4 ? ` · ••••${p.cardLast4}` : ''} · <span className={label.className}>{label.text}</span>
                    </>
                  }
                  right={<span className="shrink-0 text-[15px] font-semibold tabular-nums text-slate-950">{formatClp(p.amountClp)}</span>}
                  onClick={canOpen ? () => setReceiptFor(res) : undefined}
                  ariaLabel={canOpen ? `Ver comprobante de ${res?.spaceTitle}` : undefined}
                />
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- Hojas ---------- */}
      <AnimatePresence>
        {sheet?.kind === 'add' && (
          <Sheet key="add" title="Agregar tarjeta" onClose={closeSheet}>
            <p className="text-[15px] text-slate-600">
              Te llevamos a la página segura de <strong className="text-slate-900">Transbank</strong>. Ahí escribes tu tarjeta y vuelves solo a
              Spotly.
            </p>
            <ul className="mt-4 space-y-3 text-[15px]">
              <li className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                Spotly nunca ve el número completo.
              </li>
              <li className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
                No se cobra nada al agregarla.
              </li>
            </ul>
            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => run('add', () => addWalletCard('/billetera'))}
              disabled={busy !== null}
              className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-[15px] font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
            >
              {busy === 'add' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-5 w-5" aria-hidden="true" />}
              {busy === 'add' ? 'Abriendo Transbank…' : 'Continuar a Transbank'}
            </button>
            <details className="mt-4 text-sm text-slate-500">
              <summary className="cursor-pointer">Datos de prueba (ambiente de integración)</summary>
              <p className="mt-1">
                VISA 4051 8856 0044 6623 · CVV 123 · fecha futura. Autenticación: RUT 11.111.111-1, clave 123.
              </p>
            </details>
          </Sheet>
        )}

        {sheet?.kind === 'card' && (
          <Sheet key="card" title={`${sheet.card.cardType} ••••${sheet.card.last4}`} onClose={closeSheet}>
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
              <BrandBadge type={sheet.card.cardType} />
              <span className="text-[15px] text-slate-700">{sheet.card.isDefault ? 'Es tu tarjeta predeterminada.' : 'Tarjeta guardada.'}</span>
            </div>
            {error && (
              <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
                {error}
              </p>
            )}
            <ul className="mt-3 -mx-4">
              {!sheet.card.isDefault && (
                <Row
                  icon={
                    <IconTile className="bg-blue-50 text-blue-700">
                      {busy === 'def' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Star className="h-5 w-5" aria-hidden="true" />}
                    </IconTile>
                  }
                  title="Usar como predeterminada"
                  onClick={async () => {
                    if (await run('def', () => setDefaultWalletCard(sheet.card.id))) closeSheet();
                  }}
                />
              )}
              {!confirmDelete ? (
                <Row
                  icon={
                    <IconTile className="bg-rose-50 text-rose-700">
                      <Trash2 className="h-5 w-5" aria-hidden="true" />
                    </IconTile>
                  }
                  title={<span className="text-rose-700">Eliminar tarjeta</span>}
                  onClick={() => setConfirmDelete(true)}
                />
              ) : (
                <li className="px-4 py-3">
                  <p className="text-[15px] text-slate-700">¿Eliminar esta tarjeta? Tendrás que agregarla de nuevo para usarla.</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (await run('del', () => removeWalletCard(sheet.card.id))) closeSheet();
                      }}
                      disabled={busy !== null}
                      className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                    >
                      {busy === 'del' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Sí, eliminar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="min-h-11 flex-1 rounded-xl bg-slate-100 text-sm font-semibold text-slate-800 hover:bg-slate-200 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </li>
              )}
            </ul>
          </Sheet>
        )}

        {sheet?.kind === 'bank' && (
          <Sheet key="bank" title="Cuenta para recibir dinero" onClose={closeSheet}>
            <p className="mb-3 text-[15px] text-slate-600">
              {isOwner
                ? 'Cada martes te depositamos aquí lo que ganaste. También la usamos si una devolución no puede volver a tu tarjeta.'
                : 'Solo la usamos si una devolución no puede volver a tu tarjeta.'}
            </p>
            <BankAccountCard
              bare
              userId={currentUser.id}
              defaultName={currentUser.fullName}
              defaultRut={currentUser.rut}
              defaultEmail={currentUser.email}
              purpose=""
              onSaved={(b) => {
                setBank(b);
                loadRefunds();
                closeSheet();
                setNotice({ ok: true, text: 'Cuenta guardada.' });
              }}
            />
          </Sheet>
        )}
      </AnimatePresence>

      {receiptFor && <PaymentReceiptModal reservation={receiptFor} variant="tenant" onClose={() => setReceiptFor(null)} />}
    </div>
  );
};
