import { describe, expect, it } from 'vitest';
import { COMMUNES_BY_REGION, communesOf, regionOfCommune } from './chileCommunes.ts';

describe('chileCommunes', () => {
  it('16 regiones y 346 comunas', () => {
    expect(Object.keys(COMMUNES_BY_REGION)).toHaveLength(16);
    expect(Object.values(COMMUNES_BY_REGION).reduce((n, l) => n + l.length, 0)).toBe(346);
  });
  it('comunas por región', () => {
    expect(communesOf('Región Metropolitana')).toContain('Ñuñoa');
    expect(communesOf('Región Metropolitana')).toHaveLength(52);
    expect(communesOf('Región del Biobío')).toEqual(expect.arrayContaining(['Mulchén', 'Negrete']));
    expect(regionOfCommune('nunoa')).toBe('Región Metropolitana');
    expect(regionOfCommune('Viña del Mar')).toBe('Región de Valparaíso');
  });
});
