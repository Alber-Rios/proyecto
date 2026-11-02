import React, { useId } from 'react';
import { Lock, Minus, Plus, RotateCcw } from 'lucide-react';
import { BrandLogo } from '../BrandLogo.tsx';
import { parseClause } from '../../utils/contractClauses.ts';
import { formatClp } from '../../utils/formatters.ts';
import { useTextScale } from '../../hooks/useTextScale.ts';

// Hoja del contrato, usada antes de firmar (borrador) y al verlo firmado.
//
// Accesibilidad:
// - Todo el texto se mide en "em" sobre una base de 1rem: crece con el zoom
//   del navegador, con el tamaño de letra del sistema y con el control
//   "Tamaño del texto" (hasta 200 %), sin cortar ni tapar contenido.
// - Estructura real para lectores de pantalla: título h2, cuadro resumen como
//   lista de definiciones, valores en una tabla con encabezados, y cada
//   cláusula como elemento de lista con su propio h3.
// - Texto alineado a la izquierda, interlineado amplio y líneas de máx. ~72
//   caracteres; colores con contraste mayor a 7:1 sobre blanco.

export interface ContractParty {
  name: string;
  /** RUT ya formateado, o un texto como "Se registra al firmar". */
  rut: string;
}

export interface ContractAmountRow {
  label: string;
  value: number;
  /** Se muestra con signo menos (descuentos). */
  negative?: boolean;
}

interface ContractDocumentProps {
  status: 'draft' | 'signed';
  folio?: string;
  /** Lugar y fecha de emisión, ya formateados. */
  issuedAt: string;
  owner: ContractParty;
  tenant: ContractParty;
  spaceTitle: string;
  spaceAddress: string;
  intendedUse?: string;
  /** Vigencia en una frase ("2 de noviembre de 2026, de 08:00 a 09:00 h"). */
  term: string;
  /** Aviso de bloqueo de agenda. */
  lockNotice?: string;
  amounts?: ContractAmountRow[];
  total: number;
  clauses: string[];
  /** Bloque de firmas u otro contenido al pie. */
  children?: React.ReactNode;
}

export const ContractDocument: React.FC<ContractDocumentProps> = ({
  status,
  folio,
  issuedAt,
  owner,
  tenant,
  spaceTitle,
  spaceAddress,
  intendedUse,
  term,
  lockNotice,
  amounts = [],
  total,
  clauses,
  children,
}) => {
  const uid = useId();
  const titleId = `${uid}-title`;
  const summaryId = `${uid}-summary`;
  const clausesId = `${uid}-clauses`;
  const text = useTextScale();
  const parsed = clauses.map(parseClause);

  return (
    <div className="min-w-0">
      {/* Control de tamaño del texto (queda visible al bajar por el contrato) */}
      <div
        role="group"
        aria-label="Tamaño del texto del contrato"
        className="sticky top-0 z-10 -mx-1 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-sm print:hidden"
      >
        <span className="text-sm font-semibold text-slate-800">Tamaño del texto</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={text.decrease}
            disabled={!text.canDecrease}
            aria-label="Achicar el texto"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-900 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <output
            aria-live="polite"
            className="min-w-[4.5rem] text-center text-sm font-bold tabular-nums text-slate-900"
          >
            {text.percent} %
          </output>
          <button
            type="button"
            onClick={text.increase}
            disabled={!text.canIncrease}
            aria-label="Agrandar el texto"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-900 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
          {text.canDecrease && (
            <button
              type="button"
              onClick={text.reset}
              className="inline-flex h-11 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold text-slate-700 underline-offset-2 transition hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Restablecer
            </button>
          )}
        </div>
      </div>

      <article
        lang="es-CL"
        aria-labelledby={titleId}
        style={{ fontSize: `${text.scale}rem` }}
        className="relative overflow-hidden rounded-2xl border border-slate-300 bg-white text-slate-800 shadow-sm"
      >
        {/* Membrete */}
        <header className="border-b border-slate-200 px-[1.25em] pt-[1.25em] pb-[1em] sm:px-[2em]">
          <div className="flex flex-wrap items-start justify-between gap-[0.75em]">
            <BrandLogo className="text-[1.375em]" />
            <div className="text-left text-[0.8125em] leading-snug text-slate-700 sm:text-right">
              {status === 'draft' ? (
                <span className="inline-block rounded-md border border-amber-300 bg-amber-50 px-[0.6em] py-[0.2em] font-bold text-amber-900">
                  Borrador · se firma al continuar
                </span>
              ) : (
                folio && (
                  <>
                    <span className="block font-semibold text-slate-900">Folio</span>
                    <span className="block font-mono break-all">{folio}</span>
                  </>
                )
              )}
            </div>
          </div>

          <h2
            id={titleId}
            className="mt-[1em] font-display text-[1.625em] leading-tight font-normal tracking-tight text-balance break-words hyphens-auto text-slate-950"
          >
            Contrato de arrendamiento temporal de espacio
          </h2>
          <p className="mt-[0.35em] text-[0.875em] text-slate-700">
            Ley N° 18.101 sobre arrendamiento de predios urbanos · Firma electrónica simple, Ley N° 19.799
          </p>
          <p className="mt-[0.75em] text-[0.9375em] text-slate-800">{issuedAt}</p>
        </header>

        <div className="space-y-[1.75em] px-[1.25em] py-[1.5em] sm:px-[2em]">
          {/* Cuadro resumen */}
          <section aria-labelledby={summaryId}>
            <h3 id={summaryId} className="text-[0.8125em] font-bold tracking-[0.08em] text-slate-700">
              Cuadro resumen
            </h3>
            <dl className="mt-[0.75em] grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
              <SummaryItem term="Arrendador (propietario)">
                <span className="font-semibold text-slate-950">{owner.name}</span>
                <span className="block text-[0.9375em]">RUT {owner.rut}</span>
              </SummaryItem>
              <SummaryItem term="Arrendatario">
                <span className="font-semibold text-slate-950">{tenant.name}</span>
                <span className="block text-[0.9375em]">RUT {tenant.rut}</span>
              </SummaryItem>
              <SummaryItem term="Espacio arrendado">
                <span className="font-semibold text-slate-950">{spaceTitle}</span>
                <span className="block text-[0.9375em]">{spaceAddress}</span>
              </SummaryItem>
              {(status === 'draft' || intendedUse?.trim()) && (
                <SummaryItem term="Destino declarado">
                  {intendedUse?.trim() ? (
                    <span className="text-slate-950">{intendedUse.trim()}</span>
                  ) : (
                    <span className="text-slate-700 italic">Indícalo más abajo antes de firmar</span>
                  )}
                </SummaryItem>
              )}
              <SummaryItem term="Vigencia" wide>
                <span className="font-semibold text-slate-950">{term}</span>
                {lockNotice && (
                  <span className="mt-[0.5em] flex items-start gap-[0.4em] text-[0.9375em] text-indigo-900">
                    <Lock className="mt-[0.2em] h-[1em] w-[1em] shrink-0" aria-hidden="true" />
                    <span>{lockNotice}</span>
                  </span>
                )}
              </SummaryItem>
            </dl>

            <table className="mt-[1em] w-full border-collapse text-[0.9375em]">
              <caption className="sr-only">Valores del arriendo en pesos chilenos</caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">Concepto</th>
                  <th scope="col">Monto</th>
                </tr>
              </thead>
              <tbody>
                {amounts.map((row) => (
                  <tr key={row.label} className="border-b border-slate-200">
                    <th scope="row" className="py-[0.45em] pr-[1em] text-left font-normal text-slate-800">
                      {row.label}
                    </th>
                    <td className="py-[0.45em] text-right tabular-nums text-slate-900">
                      {row.negative ? `− ${formatClp(row.value)}` : formatClp(row.value)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="pt-[0.6em] pr-[1em] text-left text-[1.0625em] font-bold text-slate-950">
                    Total a pagar
                  </th>
                  <td className="pt-[0.6em] text-right text-[1.0625em] font-bold tabular-nums text-slate-950">
                    {formatClp(total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Cláusulas */}
          <section aria-labelledby={clausesId}>
            <h3 id={clausesId} className="text-[0.8125em] font-bold tracking-[0.08em] text-slate-700">
              Cláusulas
            </h3>
            <ol className="mt-[0.75em] max-w-[72ch] space-y-[1.25em]">
              {parsed.map((clause, idx) => (
                <li key={idx} className="break-words">
                  {clause.title ? (
                    <h4 className="text-[1em] leading-snug font-bold text-slate-950">
                      <span className="text-rose-800">{clause.ordinal}.</span> {clause.title}
                    </h4>
                  ) : null}
                  <p className={`${clause.title ? 'mt-[0.35em]' : ''} text-[1em] leading-[1.7] text-slate-800`}>
                    {clause.body}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {children}
        </div>
      </article>
    </div>
  );
};

const SummaryItem: React.FC<{ term: string; wide?: boolean; children: React.ReactNode }> = ({
  term,
  wide,
  children,
}) => (
  <div className={`min-w-0 bg-white px-[1em] py-[0.75em] ${wide ? 'sm:col-span-2' : ''}`}>
    <dt className="text-[0.8125em] font-semibold text-slate-700">{term}</dt>
    <dd className="mt-[0.2em] break-words leading-snug">{children}</dd>
  </div>
);
