import React, { useEffect, useId, useState } from 'react';
import { Landmark, Loader2, Pencil, ShieldCheck } from 'lucide-react';
import {
  BANK_ACCOUNT_TYPES,
  CHILE_BANKS,
  accountTypeLabel,
  getMyBankAccount,
  maskAccount,
  saveMyBankAccount,
  type BankAccount,
  type BankAccountType,
} from '../lib/financeApi.ts';
import { formatRut, formatRutInput, validateRut } from '../utils/formatters.ts';

// Cuenta para recibir dinero: depósitos de los martes (propietario) y
// devoluciones por transferencia (arrendatario). Una por persona.

interface Props {
  userId: string;
  defaultName: string;
  defaultRut?: string;
  defaultEmail?: string;
  /** Texto bajo el título según quién la usa. */
  purpose: string;
  /** Resalta el bloque cuando hay dinero esperando estos datos. */
  highlight?: boolean;
  onSaved?: (b: BankAccount) => void;
}

const field = 'w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10';
const labelCls = 'mb-1 block text-xs font-semibold text-slate-700';

export const BankAccountCard: React.FC<Props> = ({ userId, defaultName, defaultRut, defaultEmail, purpose, highlight, onSaved }) => {
  const id = useId();
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    holderName: defaultName,
    holderRut: defaultRut ? formatRut(defaultRut) : '',
    bank: '',
    accountType: 'cuenta_rut' as BankAccountType,
    accountNumber: '',
    email: defaultEmail || '',
  });

  useEffect(() => {
    let alive = true;
    getMyBankAccount(userId).then((b) => {
      if (!alive) return;
      setAccount(b);
      setEditing(!b);
      setLoading(false);
      if (b) setForm({ ...b, holderRut: formatRut(b.holderRut), email: b.email || '' });
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let v = e.target.value;
    if (k === 'holderRut') v = formatRutInput(v);
    if (k === 'accountNumber') v = v.replace(/[^0-9]/g, '').slice(0, 20);
    setForm((f) => ({ ...f, [k]: v }));
  };

  // CuentaRUT: el número es el RUT sin dígito verificador.
  useEffect(() => {
    if (form.accountType === 'cuenta_rut' && !form.accountNumber && validateRut(form.holderRut)) {
      setForm((f) => ({ ...f, accountNumber: f.holderRut.replace(/[^0-9kK]/g, '').slice(0, -1) }));
    }
  }, [form.accountType, form.holderRut, form.accountNumber]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (form.holderName.trim().length < 3) return setError('Escribe el nombre del titular de la cuenta.');
    if (!validateRut(form.holderRut)) return setError('El RUT del titular no es válido.');
    if (!form.bank) return setError('Elige el banco.');
    if (form.accountNumber.length < 4) return setError('Escribe el número de cuenta (solo números).');
    setSaving(true);
    try {
      const b = await saveMyBankAccount(userId, { ...form, email: form.email.trim() || null });
      setAccount(b);
      setEditing(false);
      setSaved(true);
      onSaved?.(b);
    } catch (err: any) {
      setError(/RUT/.test(err.message) ? 'El RUT del titular no es válido.' : err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby={`${id}-t`}
      className={`rounded-2xl border bg-white p-5 transition-shadow ${highlight ? 'border-amber-300 shadow-[0_0_0_4px_rgba(251,191,36,0.18)]' : 'border-slate-200'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <Landmark className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 id={`${id}-t`} className="text-base font-bold text-slate-950">Datos de tu cuenta</h3>
            <p className="text-sm text-slate-600">{purpose}</p>
          </div>
        </div>
        {account && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 active:scale-[0.97] cursor-pointer"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" /> Cambiar
          </button>
        )}
      </div>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…
        </p>
      ) : account && !editing ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Titular</dt>
            <dd className="font-semibold text-slate-900">{account.holderName}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">RUT</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{formatRut(account.holderRut)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Banco</dt>
            <dd className="font-semibold text-slate-900">{account.bank}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">{accountTypeLabel(account.accountType)}</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{maskAccount(account.accountNumber)}</dd>
          </div>
        </dl>
      ) : (
        <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
          <div>
            <label htmlFor={`${id}-n`} className={labelCls}>Nombre del titular</label>
            <input id={`${id}-n`} value={form.holderName} onChange={set('holderName')} autoComplete="name" className={field} />
          </div>
          <div>
            <label htmlFor={`${id}-r`} className={labelCls}>RUT del titular</label>
            <input id={`${id}-r`} value={form.holderRut} onChange={set('holderRut')} inputMode="text" placeholder="12.345.678-5" className={field} />
          </div>
          <div>
            <label htmlFor={`${id}-b`} className={labelCls}>Banco</label>
            <select id={`${id}-b`} value={form.bank} onChange={set('bank')} className={field}>
              <option value="">Elige tu banco</option>
              {CHILE_BANKS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-ty`} className={labelCls}>Tipo de cuenta</label>
            <select id={`${id}-ty`} value={form.accountType} onChange={set('accountType')} className={field}>
              {BANK_ACCOUNT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-a`} className={labelCls}>Número de cuenta</label>
            <input id={`${id}-a`} value={form.accountNumber} onChange={set('accountNumber')} inputMode="numeric" autoComplete="off" className={field} />
          </div>
          <div>
            <label htmlFor={`${id}-e`} className={labelCls}>Correo para el comprobante (opcional)</label>
            <input id={`${id}-e`} type="email" value={form.email} onChange={set('email')} autoComplete="email" className={field} />
          </div>
          {error && (
            <p role="alert" className="sm:col-span-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">{error}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.97] disabled:opacity-60 cursor-pointer"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Guardar cuenta
            </button>
            {account && (
              <button type="button" onClick={() => setEditing(false)} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
                Cancelar
              </button>
            )}
            <span className="flex items-center gap-1.5 text-xs text-slate-600">
              <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              Solo la ves tú y administración. Cada cambio queda en la auditoría.
            </span>
          </div>
        </form>
      )}
      {saved && !editing && (
        <p role="status" className="mt-3 text-sm font-semibold text-emerald-800">Cuenta guardada.</p>
      )}
    </section>
  );
};
