// Reserva en curso guardada mientras el usuario inscribe una tarjeta en Transbank.
// Se guarda solo en esta pestaña (sessionStorage) y expira a los 30 minutos.
const KEY = 'spotly.bookingDraft';
const MAX_AGE_MS = 30 * 60 * 1000;

export interface BookingDraft {
  spaceId: string;
  modality: 'por_hora' | 'por_dia' | 'mensual';
  startDate: string;
  endDate: string;
  hourStart: number;
  hourEnd: number;
  selectedMonth: string;
  intendedUse: string;
  signature: string | null;
}

export function saveBookingDraft(draft: BookingDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // Sin almacenamiento disponible: el usuario deberá completar la reserva nuevamente.
  }
}

export function takeBookingDraft(spaceId: string): BookingDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const data = JSON.parse(raw);
    if (data.spaceId !== spaceId || Date.now() - Number(data.savedAt) > MAX_AGE_MS) return null;
    return data as BookingDraft;
  } catch {
    return null;
  }
}
