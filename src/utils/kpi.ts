// Semáforo de los KPI según la Tabla 66 del informe (Capítulo XI).
import type { KpiSnapshot } from '../types.ts';

export type KpiLight = 'green' | 'yellow' | 'red' | 'none';

export interface EvaluatedKpi {
  id: string;
  name: string;
  display: string;
  target: string;
  light: KpiLight;
  detail?: string;
}

function lightHigherIsBetter(value: number | null, green: number, yellow: number): KpiLight {
  if (value === null || value === undefined) return 'none';
  if (value >= green) return 'green';
  if (value >= yellow) return 'yellow';
  return 'red';
}

function lightLowerIsBetter(value: number | null, green: number, yellow: number): KpiLight {
  if (value === null || value === undefined) return 'none';
  if (value <= green) return 'green';
  if (value <= yellow) return 'yellow';
  return 'red';
}

const fmt = (value: number | null | undefined, suffix: string, digits = 1) =>
  value === null || value === undefined ? 'Sin datos' : `${Number(value).toFixed(digits).replace('.', ',')}${suffix}`;

export function evaluateKpis(s: KpiSnapshot): EvaluatedKpi[] {
  return [
    {
      id: 'KPI-01',
      name: 'Tasa de ocupación horaria',
      display: fmt(s.kpi01_occupancy_pct, ' %'),
      target: 'Incremento ≥ 25 % respecto del período anterior',
      light: lightHigherIsBetter(s.kpi01_variation_pct, 25, 10),
      detail:
        s.kpi01_variation_pct == null
          ? 'Sin período anterior para comparar'
          : `Variación: ${fmt(s.kpi01_variation_pct, ' %')} (anterior ${fmt(s.kpi01_prev_occupancy_pct, ' %')})`,
    },
    {
      id: 'KPI-02',
      name: 'Tiempo de confirmación de reserva',
      display: fmt(s.kpi02_confirmation_minutes, ' min'),
      target: '≤ 5 minutos',
      light: lightLowerIsBetter(s.kpi02_confirmation_minutes, 5, 15),
    },
    {
      id: 'KPI-03',
      name: 'Tasa de sobreventa',
      display: String(s.kpi03_overbooking_count ?? 0),
      target: '0 reservas solapadas',
      light: (s.kpi03_overbooking_count ?? 0) === 0 ? 'green' : 'red',
      detail: 'Garantizado por la restricción de exclusión de la base de datos',
    },
    {
      id: 'KPI-04',
      name: 'Tasa de conversión',
      display: fmt(s.kpi04_conversion_pct, ' %', 2),
      target: '≥ 3 %',
      light: lightHigherIsBetter(s.kpi04_conversion_pct, 3, 1.5),
      detail: `${s.kpi04_conversions} reservas / ${s.kpi04_views} visitas al detalle`,
    },
    {
      id: 'KPI-05',
      name: 'Reservas con contrato firmado',
      display: fmt(s.kpi05_contract_pct, ' %'),
      target: '100 %',
      light: lightHigherIsBetter(s.kpi05_contract_pct, 100, 95),
      detail: `${s.kpi05_confirmed} reservas confirmadas`,
    },
    {
      id: 'KPI-06',
      name: 'Tiempo de revisión KYC',
      display: fmt(s.kpi06_kyc_review_hours, ' h'),
      target: '≤ 24 horas',
      light: lightLowerIsBetter(s.kpi06_kyc_review_hours, 24, 48),
    },
    {
      id: 'KPI-07',
      name: 'Tasa de cancelación',
      display: fmt(s.kpi07_cancellation_pct, ' %'),
      target: '≤ 10 %',
      light: lightLowerIsBetter(s.kpi07_cancellation_pct, 10, 15),
      detail: `${s.kpi07_created} reservas creadas`,
    },
    {
      id: 'KPI-08',
      name: 'Satisfacción del usuario',
      display: s.kpi08_avg_rating == null ? 'Sin datos' : `${Number(s.kpi08_avg_rating).toFixed(2).replace('.', ',')} / 5`,
      target: '≥ 4,0',
      light: lightHigherIsBetter(s.kpi08_avg_rating, 4, 3.5),
      detail: `${s.kpi08_reviews} valoraciones`,
    },
  ];
}
