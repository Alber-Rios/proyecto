import { describe, expect, it } from 'vitest';
import { auditDetailRows, auditEntity, describeAudit } from './auditDescribe.ts';

describe('describeAudit', () => {
  it('describe pagos, reservas y liquidaciones en español con montos', () => {
    expect(describeAudit('PAYMENT_AUTHORIZED', { amountClp: 42000 })).toBe('Pago aprobado por CLP 42.000');
    expect(describeAudit('RESERVATION_STATUS_CHANGED', { from: 'confirmed', to: 'cancelled', refundAmountClp: 40000 })).toMatch(
      /Reserva confirmada → cancelada · reembolso/
    );
    expect(describeAudit('PAYOUT_PAID', { amountClp: 36000, transferReference: 'TRF-1' })).toMatch(/ref\. TRF-1$/);
    expect(describeAudit('RESERVATION_CREATED', { totalClp: 42000, ownerCommissionRate: 0.1 })).toMatch(/comisión anfitrión 10 %$/);
  });

  it('describe accesos y administración', () => {
    expect(describeAudit('LOGIN_FAILED', { email: 'a@b.cl' })).toBe('Inicio de sesión fallido con a@b.cl');
    expect(describeAudit('ROLE_CHANGED', { from: 'tenant', to: 'owner' })).toBe('Rol arrendatario → anfitrión');
    expect(describeAudit('AUDIT_CHAIN_BROKEN', { brokenSeq: 23 })).toBe('Integridad rota en el registro n.º 23');
  });

  it('acciones desconocidas no rompen', () => {
    expect(describeAudit('ALGO_NUEVO')).toBe('algo nuevo');
  });
});

describe('detalle y entidad', () => {
  it('etiqueta y formatea los campos', () => {
    const rows = auditDetailRows({ reservationId: 'res_1', amountClp: 1000, ownerCommissionRate: 0.05, remember: true, vacio: null });
    expect(rows.find((r) => r.key === 'reservationId')?.label).toBe('Reserva');
    expect(rows.find((r) => r.key === 'ownerCommissionRate')?.value).toBe('5 %');
    expect(rows.find((r) => r.key === 'remember')?.value).toBe('Sí');
    expect(rows.some((r) => r.key === 'vacio')).toBe(false);
  });

  it('elige la entidad principal', () => {
    expect(auditEntity({ paymentId: 'pay_1', reservationId: 'res_1' })).toBe('res_1');
    expect(auditEntity({})).toBeNull();
  });
});
