import { DigitalContract, PriceUnit } from '../types.ts';
import { formatClp, formatRut } from './formatters.ts';
import { generateAuditHash } from './auditLogger.ts';

export function generateDigitalContract(data: {
  reservationId: string;
  spaceTitle: string;
  spaceAddress: string;
  tenantName: string;
  tenantRut: string;
  ownerName: string;
  ownerRut: string;
  totalClp: number;
  guaranteeDepositClp: number;
  startDate: string;
  endDate: string;
  ip: string;
  priceUnit?: PriceUnit;
  rentalModality?: 'por_hora' | 'por_dia' | 'mensual' | 'abierto';
  durationUnits?: number;
  hourStart?: number;
  hourEnd?: number;
  signatureImage?: string;
  signatureType?: 'digital_canvas' | 'token_fea';
  intendedUse?: string;
}): DigitalContract {
  const contractId = `CTR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const signedAt = new Date().toISOString();
  const rawPayload = `${contractId}|${data.tenantRut}|${data.ownerRut}|${data.totalClp}|${signedAt}`;
  const contractHash = generateAuditHash(rawPayload);

  const hasHourlySchedule = data.hourStart !== undefined && data.hourEnd !== undefined;
  const modalityText = 
    hasHourlySchedule || data.rentalModality === 'por_hora' || data.priceUnit === 'hour'
      ? `Por Hora (${data.durationUnits || 1} horas pactadas)`
      : data.rentalModality === 'mensual' || data.priceUnit === 'month'
      ? `Mensual (${data.durationUnits || 1} meses pactados)`
      : data.rentalModality === 'abierto'
      ? `Abierto/Flexible (${data.durationUnits || 1} unidades pactadas)`
      : `Por Día (${data.durationUnits || 1} días pactados)`;

  const clauses = [
    `PRIMERO (COMPARECENCIA Y PERSONERÍA LEGAL): En la República de Chile, comparecen don/doña ${data.ownerName}, Cédula Nacional de Identidad N° ${formatRut(data.ownerRut)}, domiciliado para estos efectos en el inmueble arrendado, en adelante denominada la "PARTE ARRENDADORA"; y don/doña ${data.tenantName}, Cédula Nacional de Identidad N° ${formatRut(data.tenantRut)}, en adelante denominada la "PARTE ARRENDATARIA". Las partes convienen en celebrar el presente Contrato Digital de Arrendamiento Temporal de Inmueble con plena sujeción a la Ley N° 18.101 sobre Arrendamiento de Predios Urbanos, sus modificaciones, y demás normas pertinentes del Código Civil de la República de Chile.`,

    `SEGUNDO (INDIVIDUALIZACIÓN DEL INMUEBLE Y DESTINO): La Parte Arrendadora otorga en arriendo temporal a la Parte Arrendataria, quien acepta en el estado material en que se encuentra y que declara conocer, el recinto ubicado en ${data.spaceAddress} ("${data.spaceTitle}"). El inmueble será destinado única y exclusivamente a: "${data.intendedUse || 'Actividades profesionales, comerciales o de trabajo legítimo'}", quedando terminantemente prohibido su uso para habitación permanente, subarrendamiento o actividades contrarias a las leyes de la República y ordenanzas municipales.`,

    `TERCERO (MODALIDAD Y PLAZO DE VIGENCIA): El presente contrato rige bajo la modalidad de arriendo ${modalityText}. La vigencia del arrendamiento comenzará a regir el ${data.startDate} y fenecerá irrevocablemente el ${data.endDate}. Llegada la fecha y hora de término convenida, la Parte Arrendataria deberá hacer entrega material del recinto, desocupado de sus pertenencias y en el mismo estado de aseo y operatividad en que lo recibió, sin necesidad de notificación judicial o desahucio previo.`,

    `CUARTO (PRECIO DEL ARRIENDO, TRIBUTACIÓN Y PAGO ELECTRÓNICO): El valor total del arrendamiento pactado asciende a la suma de ${formatClp(data.totalClp)}, pagadero íntegramente de manera anticipada a través del procesador de pagos electrónicos Webpay Plus / Transbank habilitado en la plataforma Spotly (mandataria para la recaudación). Las partes dejan constancia de que los arriendos amoblados se encuentran afectos al Impuesto al Valor Agregado (IVA - 19%) de acuerdo al Decreto Ley N° 825 y la Circular N° 37 del SII.`,

    `QUINTO (DEPÓSITO DE GARANTÍA Y MECANISMO DE RESTITUCIÓN): Para caucionar la debida conservación del inmueble, el pago de eventuales deterioros, multas o exceso en el tiempo de ocupación, la Parte Arrendataria constituye un depósito de garantía por la suma de ${formatClp(data.guaranteeDepositClp)}. Dicha suma queda retenida en custodia digital y será restituida íntegramente a la cuenta bancaria del arrendatario en un plazo no superior a 48 horas hábiles tras el check-out, previa verificación y conformidad del estado del espacio por el propietario.`,

    `SEXTO (CONSERVACIÓN, PROHIBICIÓN DE CESIÓN Y RESPONSABILIDAD CIVIL): La Parte Arrendataria se obliga a mantener el recinto en óptimas condiciones, velar por el cumplimiento del aforo máximo permitido, respetar las normas de copropiedad y responder íntegramente por los daños que ocasionen sus dependientes, invitados o asistentes. Queda prohibida la cesión total o parcial de este contrato, así como el subarriendo a terceros bajo cualquier título.`,

    `SÉPTIMO (DOMICILIO CONVENCIONAL Y JURISDICCIÓN): Para todos los efectos legales derivados de este contrato, las partes fijan su domicilio en la comuna donde se emplaza el inmueble arrendado y se someten a la competencia de los Tribunales Ordinarios de Justicia de la República de Chile.`,

    `OCTAVO (FIRMA ELECTRÓNICA Y VALIDEZ JURÍDICA LEY 19.799): En virtud de la Ley N° 19.799 sobre Documentos Electrónicos, Firma Electrónica y Servicios de Certificación, las partes otorgan pleno valor probatorio y vinculante a la suscripción digital o electrónica efectuada. Se genera un sello criptográfico inmutable verificado bajo el hash SHA-256: ${contractHash}, suscrito desde la dirección IP ${data.ip} y registrado en el Libro Notarial Digital de Spotly.`,
  ];

  return {
    id: contractId,
    reservationId: data.reservationId,
    spaceTitle: data.spaceTitle,
    spaceAddress: data.spaceAddress,
    tenantName: data.tenantName,
    tenantRut: data.tenantRut,
    ownerName: data.ownerName,
    ownerRut: data.ownerRut,
    totalClp: data.totalClp,
    guaranteeDepositClp: data.guaranteeDepositClp,
    startDate: data.startDate,
    endDate: data.endDate,
    clauses,
    signedAt,
    contractHash,
    priceUnit: data.priceUnit,
    rentalModality: data.rentalModality,
    signatureImage: data.signatureImage,
    signatureType: data.signatureType || 'digital_canvas',
    tenantSignature: {
      rut: data.tenantRut,
      fullName: data.tenantName,
      signedAt,
      ip: data.ip,
      verificationToken: `CHL-SIGN-${contractHash.slice(-8)}`,
    },
  };
}
