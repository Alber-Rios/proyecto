import { describe, expect, it } from 'vitest';
import { nextTaxReview, taxCanPublish, taxReviewDue, taxSemesterStart, taxStatusOk, type TaxStatus } from './financeApi.ts';

const base: TaxStatus = {
  userId: 'u', hasActivity: true, upToDate: true, activityStart: null, activityCode: '681012', activityName: null,
  exemptDeclared: false, exemptDeclaredAt: null, source: 'simulado', simulated: true, checkedAt: new Date().toISOString(),
};

describe('revisión tributaria semestral (Ley 21.713)', () => {
  it('el semestre parte el 1 de enero o el 1 de julio', () => {
    expect(taxSemesterStart(new Date('2026-03-15T15:00:00Z')).getMonth()).toBe(0);
    expect(taxSemesterStart(new Date('2026-11-24T15:00:00Z')).getMonth()).toBe(6);
    expect(nextTaxReview(new Date('2026-11-24T15:00:00Z')).getFullYear()).toBe(2027);
    expect(nextTaxReview(new Date('2026-03-15T15:00:00Z')).getMonth()).toBe(6);
  });
  it('una revisión de un semestre anterior queda pendiente y deja de acreditar cumplimiento', () => {
    const old = { ...base, checkedAt: '2025-12-20T12:00:00Z' };
    expect(taxReviewDue(old)).toBe(true);
    expect(taxStatusOk(old)).toBe(false);
    expect(taxStatusOk(base)).toBe(true);
  });
  it('sin inicio de actividades solo publica si declaró no estar obligado', () => {
    const sin = { ...base, hasActivity: false, upToDate: false };
    expect(taxCanPublish(sin)).toBe(false);
    expect(taxCanPublish({ ...sin, exemptDeclared: true })).toBe(true);
    expect(taxStatusOk({ ...sin, exemptDeclared: true })).toBe(false);
  });
});
