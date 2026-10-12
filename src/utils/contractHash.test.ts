import { describe, expect, it } from 'vitest';
import {
  canonicalContractPayload,
  computeContractHash,
  isSha256Hex,
  sha256Hex,
  verifyContractIntegrity,
} from './contractHash.ts';

const contract = {
  id: 'CTR-1',
  reservationId: 'RES-1',
  spaceTitle: 'Sala Providencia',
  spaceAddress: 'Av. Providencia 123, Providencia',
  tenantName: 'Ana Pérez',
  tenantRut: '11.111.111-1',
  ownerName: 'Luis Soto',
  ownerRut: '22.222.222-2',
  totalClp: 155000,
  guaranteeDepositClp: 50000,
  startDate: '2026-10-20',
  endDate: '2026-10-20',
  clauses: ['PRIMERO: ...', 'SEGUNDO: ...'],
  signedAt: '2026-10-12T15:00:00.000Z',
  signatureImage: 'data:image/png;base64,AAAA',
};

describe('sha256Hex (RF-24)', () => {
  it('calcula el SHA-256 estándar', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('computeContractHash', () => {
  it('es determinista y produce 64 caracteres hexadecimales', async () => {
    const a = await computeContractHash(contract);
    const b = await computeContractHash({ ...contract, signedAt: '2026-10-12T15:00:00+00:00' });
    expect(a).toBe(b);
    expect(isSha256Hex(a)).toBe(true);
  });

  it('cambia si se altera cualquier dato del contrato', async () => {
    const original = await computeContractHash(contract);
    expect(await computeContractHash({ ...contract, totalClp: 1 })).not.toBe(original);
    expect(await computeContractHash({ ...contract, clauses: ['PRIMERO: alterado', 'SEGUNDO: ...'] })).not.toBe(original);
    expect(await computeContractHash({ ...contract, signatureImage: undefined })).not.toBe(original);
  });

  it('normaliza montos numéricos que llegan como texto desde la base', () => {
    expect(canonicalContractPayload({ ...contract, totalClp: '155000' as unknown as number })).toBe(
      canonicalContractPayload(contract)
    );
  });
});

describe('verifyContractIntegrity (RF-26 / CP-16)', () => {
  it('reconoce un contrato íntegro', async () => {
    const hash = await computeContractHash(contract);
    const result = await verifyContractIntegrity({ ...contract, contractHash: hash });
    expect(result.status).toBe('valid');
    expect((await verifyContractIntegrity({ ...contract, contractHash: hash }, hash.toUpperCase())).status).toBe('valid');
  });

  it('detecta un contrato alterado después de firmar', async () => {
    const hash = await computeContractHash(contract);
    const result = await verifyContractIntegrity({ ...contract, totalClp: 999, contractHash: hash });
    expect(result.status).toBe('tampered');
  });

  it('detecta un hash de referencia que no corresponde', async () => {
    const hash = await computeContractHash(contract);
    const result = await verifyContractIntegrity({ ...contract, contractHash: hash }, 'f'.repeat(64));
    expect(result.status).toBe('tampered');
    expect(result.message).toMatch(/no corresponde/);
  });

  it('marca como heredados los sellos anteriores a SHA-256', async () => {
    const result = await verifyContractIntegrity({ ...contract, contractHash: 'CL-SHA256-ABCDEF12-123456' });
    expect(result.status).toBe('legacy');
  });
});
