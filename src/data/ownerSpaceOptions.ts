// Opciones del formulario de publicación de espacios del panel de propietario.

export const CHILEAN_COMMUNES = [
  'Las Condes',
  'Providencia',
  'Santiago Centro',
  'Ñuñoa',
  'Vitacura',
  'Lo Barnechea',
  'Macul',
];

export const POPULAR_AMENITIES = [
  'Wifi Fibra Óptica 1Gbps',
  'Aire Acondicionado / Climatización',
  'Calefacción Central',
  'Seguridad y Cámaras 24/7',
  'Proyector 4K & Telón',
  'Pizarra Acrílica',
  'Estacionamiento Clientes',
  'Recepción y Conserjería',
  'Cocina / Cafetería Equipada',
  'Acceso Universal / Rampas',
  'Ascensor de Alta Velocidad',
  'Grupo Electrógeno',
];

export const POPULAR_RULES = [
  'Prohibido fumar en recintos cerrados (Ley 20.660)',
  'Música moderada / Sin ruidos molestos post 22:00',
  'Entregar el espacio aseado y ordenado',
  'Mascotas permitidas (Pet Friendly)',
  'Catering y banquetería externa permitida',
  'Capacidad máxima estrictamente respetada',
];

export const AVAILABILITY_DAY_OPTIONS = [
  { value: 'Lun-Vie', label: 'Lunes a viernes (Lun-Vie)' },
  { value: 'Lun-Sáb', label: 'Lunes a sábado (Lun-Sáb)' },
  { value: 'Lun-Dom', label: 'Todos los días (Lun-Dom)' },
  { value: 'Sáb-Dom', label: 'Fines de semana (Sáb-Dom)' },
  { value: '24/7', label: '24 Horas / 7 Días (Continuo)' },
];

export const OPERATION_HOUR_OPTIONS = [
  '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30',
  '22:00', '22:30', '23:00', '23:30', '24:00',
];

export const parsePositiveIntInput = (raw: string): number | '' => {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (digits === '') return '';
  return parseInt(digits, 10);
};
