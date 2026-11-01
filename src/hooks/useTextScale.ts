import { useCallback, useState } from 'react';

// Tamaño de letra del contrato elegido por la persona (se recuerda en este navegador).
export const TEXT_SCALE_STEPS = [1, 1.15, 1.3, 1.5, 1.75, 2] as const;
const STORAGE_KEY = 'spotly_contract_text_scale';

const readStored = (): number => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const index = raw === null ? 0 : Number(raw);
    return Number.isInteger(index) && index >= 0 && index < TEXT_SCALE_STEPS.length ? index : 0;
  } catch {
    return 0;
  }
};

export function useTextScale() {
  const [index, setIndex] = useState<number>(readStored);

  const update = useCallback((next: number) => {
    const clamped = Math.min(TEXT_SCALE_STEPS.length - 1, Math.max(0, next));
    setIndex(clamped);
    try {
      localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      /* almacenamiento no disponible: el tamaño vale solo para esta vista */
    }
  }, []);

  return {
    scale: TEXT_SCALE_STEPS[index],
    percent: Math.round(TEXT_SCALE_STEPS[index] * 100),
    canDecrease: index > 0,
    canIncrease: index < TEXT_SCALE_STEPS.length - 1,
    decrease: () => update(index - 1),
    increase: () => update(index + 1),
    reset: () => update(0),
  };
}
