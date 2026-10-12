// Huella SHA-256 de los contratos digitales (RF-24, RF-26, RNF-08).
//
// El hash se calcula sobre una representación canónica del contrato: versión,
// identificadores, partes, montos, fechas, cláusulas, fecha de firma y la imagen
// de la firma. Cualquier cambio en esos datos produce un hash distinto, lo que
// permite detectar alteraciones recalculándolo a partir de lo almacenado.

export const CONTRACT_HASH_ALGORITHM = 'SHA-256';
export const CONTRACT_HASH_VERSION = 'spotly-contract-v1';

export interface HashableContract {
  id: string;
  reservationId: string;
  spaceTitle: string;
  spaceAddress: string;
  tenantName: string;
  tenantRut: string;
  ownerName: string;
  ownerRut: string;
  totalClp: number;
  guaranteeDepositClp: number;
  startDate: string;
  endDate: string;
  clauses: string[];
  signedAt: string;
  signatureImage?: string;
}

export function canonicalContractPayload(contract: HashableContract): string {
  return JSON.stringify([
    CONTRACT_HASH_VERSION,
    contract.id,
    contract.reservationId,
    contract.spaceTitle,
    contract.spaceAddress,
    contract.tenantName,
    contract.tenantRut,
    contract.ownerName,
    contract.ownerRut,
    Number(contract.totalClp),
    Number(contract.guaranteeDepositClp),
    contract.startDate,
    contract.endDate,
    contract.clauses,
    new Date(contract.signedAt).toISOString(),
    contract.signatureImage || '',
  ]);
}

export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('El navegador no soporta Web Crypto (SHA-256). Usa un navegador actualizado con HTTPS.');
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function computeContractHash(contract: HashableContract): Promise<string> {
  return sha256Hex(canonicalContractPayload(contract));
}

export function isSha256Hex(value: string | undefined | null): boolean {
  return Boolean(value && /^[0-9a-f]{64}$/.test(value));
}

export interface ContractIntegrityResult {
  status: 'valid' | 'tampered' | 'legacy';
  storedHash: string;
  computedHash?: string;
  message: string;
}

export async function verifyContractIntegrity(
  contract: HashableContract & { contractHash: string },
  expectedHash?: string
): Promise<ContractIntegrityResult> {
  const stored = contract.contractHash;
  if (!isSha256Hex(stored)) {
    return {
      status: 'legacy',
      storedHash: stored,
      message:
        'Contrato emitido antes de la incorporación de SHA-256: su sello no es verificable criptográficamente.',
    };
  }

  const computed = await computeContractHash(contract);
  const reference = (expectedHash || '').trim().toLowerCase();
  const matchesStored = computed === stored;
  const matchesReference = !reference || reference === computed;

  if (matchesStored && matchesReference) {
    return {
      status: 'valid',
      storedHash: stored,
      computedHash: computed,
      message: 'Íntegro: el hash recalculado coincide con el sello registrado al firmar.',
    };
  }

  return {
    status: 'tampered',
    storedHash: stored,
    computedHash: computed,
    message: !matchesStored
      ? 'Alterado: el contenido actual del contrato no corresponde al sello SHA-256 registrado al firmar.'
      : 'No coincide: el hash ingresado no corresponde a este contrato.',
  };
}
