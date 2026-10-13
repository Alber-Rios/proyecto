// Tipos de espacio que se pueden publicar en Spotly.
// Debe coincidir con la restricción spaces_category_check de supabase/reset-and-setup.sql.
import type { LucideIcon } from 'lucide-react';
import {
  Briefcase,
  Building2,
  Camera,
  Car,
  Flame,
  House,
  LayoutGrid,
  PartyPopper,
  Presentation,
  Stethoscope,
  Store,
  TreePine,
  Trees,
  Users,
  Warehouse,
} from 'lucide-react';
import type { SpaceCategory, SpaceEnvironment } from '../types.ts';

export type CategoryGroupId = 'hogar' | 'trabajo' | 'eventos' | 'comercio' | 'otros';

export interface SpaceCategoryInfo {
  id: SpaceCategory;
  label: string; // singular, para fichas y formularios
  plural: string; // para filtros del catálogo
  hint: string; // ejemplo breve para quien publica
  group: CategoryGroupId;
  icon: LucideIcon;
  environment: SpaceEnvironment; // valor sugerido al publicar
}

export const CATEGORY_GROUPS: { id: CategoryGroupId; label: string }[] = [
  { id: 'hogar', label: 'Hogar y descanso' },
  { id: 'trabajo', label: 'Trabajo y reuniones' },
  { id: 'eventos', label: 'Eventos y celebraciones' },
  { id: 'comercio', label: 'Comercio y almacenaje' },
  { id: 'otros', label: 'Otros' },
];

export const SPACE_CATEGORIES: SpaceCategoryInfo[] = [
  { id: 'departamento', label: 'Departamento', plural: 'Departamentos', hint: 'Departamento amoblado o estudio', group: 'hogar', icon: Building2, environment: 'cerrado' },
  { id: 'casa', label: 'Casa', plural: 'Casas', hint: 'Casa completa o habitación', group: 'hogar', icon: House, environment: 'cerrado' },
  { id: 'cabana', label: 'Cabaña', plural: 'Cabañas', hint: 'Cabaña o refugio', group: 'hogar', icon: TreePine, environment: 'cerrado' },
  { id: 'oficina', label: 'Oficina privada', plural: 'Oficinas', hint: 'Oficina para una persona o un equipo', group: 'trabajo', icon: Briefcase, environment: 'cerrado' },
  { id: 'cowork', label: 'Puesto de trabajo compartido', plural: 'Trabajo compartido', hint: 'Escritorio en un espacio compartido', group: 'trabajo', icon: Users, environment: 'cerrado' },
  { id: 'sala_reuniones', label: 'Sala de reuniones', plural: 'Salas de reuniones', hint: 'Sala para reuniones o capacitaciones', group: 'trabajo', icon: Presentation, environment: 'cerrado' },
  { id: 'consulta', label: 'Consulta o box de atención', plural: 'Consultas y boxes', hint: 'Consulta médica, psicológica o de estética', group: 'trabajo', icon: Stethoscope, environment: 'cerrado' },
  { id: 'estudio', label: 'Estudio de foto, video o música', plural: 'Estudios', hint: 'Estudio de grabación o fotografía', group: 'trabajo', icon: Camera, environment: 'cerrado' },
  { id: 'salon_eventos', label: 'Salón de eventos', plural: 'Salones de eventos', hint: 'Salón para cumpleaños, matrimonios o seminarios', group: 'eventos', icon: PartyPopper, environment: 'cerrado' },
  { id: 'quincho', label: 'Quincho', plural: 'Quinchos', hint: 'Quincho con parrilla para asados', group: 'eventos', icon: Flame, environment: 'abierto' },
  { id: 'terreno', label: 'Terreno o patio', plural: 'Terrenos y patios', hint: 'Patio, jardín o terreno al aire libre', group: 'eventos', icon: Trees, environment: 'abierto' },
  { id: 'local_comercial', label: 'Local comercial', plural: 'Locales comerciales', hint: 'Local a la calle o en galería', group: 'comercio', icon: Store, environment: 'cerrado' },
  { id: 'bodega', label: 'Bodega', plural: 'Bodegas', hint: 'Bodega o espacio de almacenaje', group: 'comercio', icon: Warehouse, environment: 'cerrado' },
  { id: 'estacionamiento', label: 'Estacionamiento', plural: 'Estacionamientos', hint: 'Estacionamiento techado o al aire libre', group: 'comercio', icon: Car, environment: 'abierto' },
  { id: 'otro', label: 'Otro tipo de espacio', plural: 'Otros', hint: 'Cualquier otro espacio arrendable', group: 'otros', icon: LayoutGrid, environment: 'cerrado' },
];

const BY_ID = new Map(SPACE_CATEGORIES.map((c) => [c.id, c]));

// Valores usados antes de traducir las categorías al español.
const LEGACY_CATEGORIES: Record<string, SpaceCategory> = {
  office: 'oficina',
  cowork: 'cowork',
  event: 'salon_eventos',
  studio: 'estudio',
  warehouse: 'bodega',
  retail: 'local_comercial',
};

export function normalizeCategory(value: string | null | undefined): SpaceCategory {
  if (!value) return 'otro';
  if (BY_ID.has(value as SpaceCategory)) return value as SpaceCategory;
  return LEGACY_CATEGORIES[value] || 'otro';
}

export function getCategoryInfo(value: string | null | undefined): SpaceCategoryInfo {
  return BY_ID.get(normalizeCategory(value))!;
}

export function getCategoryLabel(value: string | null | undefined): string {
  return getCategoryInfo(value).label;
}
