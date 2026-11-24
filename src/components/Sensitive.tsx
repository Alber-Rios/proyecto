import React, { useEffect, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { maskValue, plainValue, type SensitiveKind } from '../utils/mask.ts';

const REVEAL_MS = 15000;

const LABEL: Record<SensitiveKind, string> = {
  rut: 'RUT',
  email: 'correo',
  phone: 'teléfono',
  account: 'número de cuenta',
  serial: 'número de documento',
};

// Se vuelve a ocultar solo, por si la persona deja la pantalla abierta.
function useReveal() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const t = window.setTimeout(() => setShown(false), REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [shown]);
  return [shown, setShown] as const;
}

/**
 * Dato personal enmascarado (23.•••.•••-5). El botón del ojo lo muestra 15 segundos.
 * Con `printFull` se imprime completo (contratos y comprobantes), pero en pantalla
 * sigue oculto.
 */
export const Sensitive: React.FC<{
  kind: SensitiveKind;
  value?: string | null;
  className?: string;
  /** Sin botón para mostrar (por ejemplo, en listas largas). */
  noReveal?: boolean;
  printFull?: boolean;
}> = ({ kind, value, className = '', noReveal, printFull }) => {
  const [shown, setShown] = useReveal();
  const plain = plainValue(kind, value);
  if (!plain) return null;
  const masked = maskValue(kind, value);
  const text = shown ? plain : masked;
  return (
    <span className={`inline-flex items-center gap-1 align-baseline ${className}`}>
      <span className={printFull ? 'print:hidden' : ''} translate="no">
        {text}
      </span>
      {printFull && (
        <span className="hidden print:inline" translate="no">
          {plain}
        </span>
      )}
      {!noReveal && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShown((s) => !s);
          }}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-rose-500 cursor-pointer print:hidden"
          aria-label={shown ? `Ocultar ${LABEL[kind]}` : `Mostrar ${LABEL[kind]}`}
          aria-pressed={shown}
          title={shown ? 'Ocultar' : 'Mostrar 15 segundos'}
        >
          {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      )}
    </span>
  );
};

/**
 * Campo de formulario para un dato personal: se ve enmascarado hasta que la persona
 * toca el ojo; ahí se puede leer y editar.
 */
export const SensitiveInput: React.FC<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
    kind: SensitiveKind;
    value: string;
    onChange: (value: string) => void;
  }
> = ({ kind, value, onChange, className = '', id, ...rest }) => {
  const [shown, setShown] = useReveal();
  const [editing, setEditing] = useState(false);
  const autoId = useId();
  const inputId = id || autoId;
  const visible = shown || editing;
  return (
    <div className="relative">
      <input
        {...rest}
        id={inputId}
        value={visible ? value : maskValue(kind, value) || value}
        readOnly={!visible || rest.readOnly}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (shown) setEditing(true);
        }}
        onBlur={() => setEditing(false)}
        className={`${className} pr-10`}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => {
          setShown((s) => !s);
          setEditing(false);
        }}
        className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-rose-500 cursor-pointer"
        aria-label={visible ? `Ocultar ${LABEL[kind]}` : `Mostrar y editar ${LABEL[kind]}`}
        aria-controls={inputId}
        aria-pressed={visible}
        title={visible ? 'Ocultar' : 'Mostrar para ver o editar'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
};
