import { describe, expect, it } from 'vitest';
import { parseClause } from './contractClauses.ts';
import { buildContractClauses } from './contractGenerator.ts';

describe('parseClause', () => {
  it('separa número, título y cuerpo', () => {
    const parsed = parseClause('PRIMERO (COMPARECENCIA Y PERSONERÍA LEGAL): En la República de Chile, comparecen…');
    expect(parsed.ordinal).toBe('Primero');
    expect(parsed.title).toBe('Comparecencia y personería legal');
    expect(parsed.body).toBe('En la República de Chile, comparecen…');
  });

  it('deja intacto un texto sin formato de cláusula', () => {
    expect(parseClause('Texto libre de un contrato antiguo.')).toEqual({
      ordinal: null,
      title: null,
      body: 'Texto libre de un contrato antiguo.',
    });
  });

  it('todas las cláusulas generadas tienen número y título', () => {
    const clauses = buildContractClauses({
      spaceTitle: 'Bodega',
      spaceAddress: 'Irarrázaval 1540, Ñuñoa',
      tenantName: 'Ana Pérez',
      tenantRut: '12345678-5',
      ownerName: 'Luis Soto',
      ownerRut: '11111111-1',
      totalClp: 21000,
      guaranteeDepositClp: 5000,
      startDate: '2026-11-02',
      endDate: '2026-11-02',
      ip: '127.0.0.1',
      rentalModality: 'por_hora',
      durationUnits: 1,
      hourStart: 8,
      hourEnd: 9,
      intendedUse: 'Guardar muebles',
    });
    expect(clauses).toHaveLength(9);
    for (const clause of clauses) {
      const parsed = parseClause(clause);
      expect(parsed.ordinal).not.toBeNull();
      expect(parsed.title).not.toBeNull();
    }
  });
});
