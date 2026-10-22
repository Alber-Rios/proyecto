import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utilidad estándar de shadcn/ui: combina clases de Tailwind sin conflictos.
// La usan los componentes que se agregan con `npx shadcn add ...` (p. ej. Skiper UI).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
