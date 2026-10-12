import { defineConfig } from 'vitest/config';

// Pruebas unitarias de la lógica de negocio crítica (Plan de pruebas, Tabla 68; RNF-11).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/utils/pricing.ts',
        'src/utils/refundPolicy.ts',
        'src/utils/contractHash.ts',
        'src/utils/revenueReport.ts',
        'src/utils/kpi.ts',
        'src/utils/ageValidation.ts',
      ],
      thresholds: { lines: 60, functions: 60, branches: 60, statements: 60 },
    },
  },
});
