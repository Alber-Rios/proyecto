import { describe, expect, it } from 'vitest';
import { taxCanPublish, taxPending, taxReviewDue, taxStatusOk, taxValidUntil, type TaxStatus } from './financeApi.ts';

const base: TaxStatus = {
  userId: 'u', hasActivity: true, upToDate: true, activityStart: null, activityCode: '681012', activityName: null,
  exemptDeclared: false, exemptDeclaredAt: null, source: 'admin', simulated: false, checkedAt: new Date().toISOString(),
  certificatePath: 'u/carpeta.pdf', certificateUploadedAt: new Date().toISOString(), reviewStatus: 'reviewed', reviewNote: null, reviewedAt: new Date().toISOString(),
};

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

describe('carpeta tributaria cada 90 días (Ley 21.713)', () => {
  it('vale 90 días desde que se sube', () => {
    const t = { ...base, certificateUploadedAt: '2026-11-01T12:00:00Z' };
    expect(taxValidUntil(t).toISOString().slice(0, 10)).toBe('2027-01-30');
  });
  it('una carpeta de más de 90 días vence y deja de acreditar cumplimiento', () => {
    const old = { ...base, certificateUploadedAt: daysAgo(91) };
    expect(taxReviewDue(old)).toBe(true);
    expect(taxStatusOk(old)).toBe(false);
    expect(taxStatusOk({ ...base, certificateUploadedAt: daysAgo(10) })).toBe(true);
  });
  it('con la carpeta por revisar ya puede publicar (queda en revisión)', () => {
    const pend = { ...base, hasActivity: false, upToDate: false, reviewStatus: 'pending' as const, certificateUploadedAt: daysAgo(1) };
    expect(taxPending(pend)).toBe(true);
    expect(taxCanPublish(pend)).toBe(true);
    expect(taxStatusOk(pend)).toBe(false);
  });
  it('sin inicio de actividades solo publica si declaró no estar obligado', () => {
    const sin = { ...base, hasActivity: false, upToDate: false };
    expect(taxCanPublish(sin)).toBe(false);
    expect(taxCanPublish({ ...sin, exemptDeclared: true })).toBe(true);
    expect(taxStatusOk({ ...sin, exemptDeclared: true })).toBe(false);
  });
});
