import React, { useEffect, useState } from 'react';
import { DEFAULT_PLATFORM_SETTINGS, getPlatformSettings, type PlatformSettings } from '../../lib/financeApi.ts';
import { formatLongDate } from '../../utils/contractTerm.ts';
import { getTodayIso } from '../../utils/formatters.ts';

const pct = (rate: number) => `${Math.round(rate * 1000) / 10} %`.replace('.', ',');

/** Recuadro breve con la comisión vigente del anfitrión (pie del menú lateral). */
export const OwnerCommissionNote: React.FC<{ acceptedBookings: number; onOpen?: () => void }> = ({ acceptedBookings, onOpen }) => {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  useEffect(() => {
    let alive = true;
    getPlatformSettings().then((s) => alive && setSettings(s));
    return () => {
      alive = false;
    };
  }, []);

  const inLaunch = getTodayIso() <= settings.launchEndsOn;
  const freeLeft = Math.max(settings.ownerFreeBookings - acceptedBookings, 0);
  const free = inLaunch || freeLeft > 0;

  const title = inLaunch ? 'Comisión 0 %' : freeLeft > 0 ? 'Comisión 0 %' : `Comisión ${pct(settings.ownerCommissionRate)}`;
  const detail = inLaunch
    ? `Lanzamiento hasta el ${formatLongDate(settings.launchEndsOn, false)}.`
    : freeLeft > 0
      ? freeLeft === 1
        ? 'Tu próxima reserva va sin comisión.'
        : `Tus próximas ${freeLeft} reservas van sin comisión.`
      : `${pct(settings.ownerCommissionRateMonthly)} en arriendos mensuales.`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-2xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
        free ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
      }`}
    >
      <span className={`block text-sm font-bold ${free ? 'text-emerald-900' : 'text-slate-900'}`}>{title}</span>
      <span className={`block text-xs leading-snug ${free ? 'text-emerald-800' : 'text-slate-600'}`}>{detail}</span>
    </button>
  );
};
