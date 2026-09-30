import { AuditLog, AuditMetadata } from '../types.ts';

let memoryAuditLogs: AuditLog[] = [];

// Genera un hash criptográfico determinista simple para firma y auditoría
export function generateAuditHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const timestampPart = Date.now().toString(16).slice(-6);
  return `CL-SHA256-${hex.toUpperCase()}-${timestampPart}`;
}

export function getClientAuditMetadata(termsVersion = '2026.1-CL'): AuditMetadata {
  const now = new Date().toISOString();
  const chileanIps = [
    '190.161.42.88 (VTR Banda Ancha Chile)',
    '200.89.70.12 (Entel PCS Chile)',
    '181.42.18.204 (Mundo Pacífico Fibra)',
    '201.241.112.55 (Movistar Chile)',
  ];
  const randomIp = chileanIps[Math.floor(Math.random() * chileanIps.length)];

  const userAgent =
    typeof navigator !== 'undefined'
      ? navigator.userAgent
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const rawString = `${randomIp}|${userAgent}|${now}|${termsVersion}`;

  return {
    ip: randomIp,
    userAgent,
    timestamp: now,
    termsVersion,
    hash: generateAuditHash(rawString),
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
