import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// Campo de contraseña con el botón de ver/ocultar siempre visible. El ojo propio
// del navegador (Edge) se oculta en index.css porque desaparece al salir del campo.
export const PasswordInput: React.FC<Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { className?: string }> = ({
  className = '',
  ...props
}) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={`${className} pr-11`} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={show}
        aria-controls={props.id}
        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-stone-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-rose-500 cursor-pointer"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
};
