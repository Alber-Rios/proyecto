import { AuditLog, AuditMetadata } from '../types.ts';
import { sha256Hex } from './contractHash.ts';
import { apiUrl } from './api.ts';

let memoryAuditLogs: AuditLog[] = [];

// La IP real la fija el servidor: la base de datos la toma de las cabeceras del
// request al insertar en audit_logs (RNF-14). En el cliente solo se muestra este
// marcador hasta recargar los registros desde Supabase.
export const SERVER_RECORDED_IP = 'registrada por el servidor';

let cachedClientIp: string | null = null;

// IP pública del cliente vista por nuestro backend (para consignarla en el contrato).
export async function fetchClientIp(): Promise<string> {
  if (cachedClientIp) return cachedClientIp;
  try {
    const response = await fetch(apiUrl('/api/client-ip'), { cache: 'no-store' });
    if (response.ok) {
      const data = (await response.json()) as { ip?: string };
      if (data.ip) {
        cachedClientIp = data.ip;
        return data.ip;
      }
    }
  } catch {
    // Sin backend disponible (por ejemplo, sitio estático): se informa como no disponible.
  }
  return 'no disponible';
}

export async function buildAuditMetadata(termsVersion = '2026.1-CL'): Promise<AuditMetadata> {
  const now = new Date().toISOString();
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'desconocido';
  const ip = await fetchClientIp();
  return {
    ip,
    userAgent,
    timestamp: now,
    termsVersion,
    hash: await sha256Hex(`${ip}|${userAgent}|${now}|${termsVersion}`),
    legalNoticeAccepted: true,
  };
}

export function saveAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): AuditLog {
  const newLog: AuditLog = {
    ...log,
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
  };

  memoryAuditLogs = [newLog, ...memoryAuditLogs].slice(0, 150);
  return newLog;
}

export function getAuditLogs(): AuditLog[] {
  return memoryAuditLogs;
}

export function clearAuditLogs(): void {
  memoryAuditLogs = [];
}
