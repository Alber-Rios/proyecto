import { DigitalContract, PriceUnit } from '../types.ts';
import { formatClp, formatRut } from './formatters.ts';
import { CONTRACT_HASH_ALGORITHM, CONTRACT_HASH_VERSION, computeContractHash } from './contractHash.ts';

export async function generateDigitalContract(data: {
  reservationId: string;
  spaceTitle: string;
  spaceAddress: string;
  tenantName: string;
  tenantRut: string;
  ownerName: string;
  ownerRut: string;
  totalClp: number;
  guaranteeDepositClp: number;
  discountClp?: number;
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
}): Promise<DigitalContract> {
  const contractId = `CTR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const signedAt = new Date().toISOString();

  const hasHourlySchedule = data.hourStart !== undefined && data.hourEnd !== undefined;
  const scheduleText = hasHourlySchedule
    ? `, entre las ${String(data.hourStart).padStart(2, '0')}:00 y las ${String(data.hourEnd).padStart(2, '0')}:00 horas`
    : '';
  const modalityText =
    hasHourlySchedule || data.rentalModality === 'por_hora' || data.priceUnit === 'hour'
      ? `Por Hora (${data.durationUnits || 1} horas pactadas)`
      : data.rentalModality === 'mensual' || data.priceUnit === 'month'
      ? `Mensual (${data.durationUnits || 1} meses pactados)`
      : data.rentalModality === 'abierto'
      ? `Abierto/Flexible (${data.durationUnits || 1} unidades pactadas)`
      : `Por Día (${data.durationUnits || 1} días pactados)`;
  const discountText =
    data.discountClp && data.discountClp > 0
      ? ` Este monto ya incluye un descuento promocional de ${formatClp(data.discountClp)} sobre el valor del arriendo.`
      : '';

  const clauses = [
    `PRIMERO (COMPARECENCIA Y PERSONERÍA LEGAL): En la República de Chile, comparecen don/doña ${data.ownerName}, Cédula Nacional de Identidad N° ${formatRut(data.ownerRut)}, domiciliado para estos efectos en el inmueble arrendado, en adelante denominada la "PARTE ARRENDADORA"; y don/doña ${data.tenantName}, Cédula Nacional de Identidad N° ${formatRut(data.tenantRut)}, en adelante denominada la "PARTE ARRENDATARIA". Las partes convienen en celebrar el presente Contrato Digital de Arrendamiento Temporal de Inmueble con plena sujeción a la Ley N° 18.101 sobre Arrendamiento de Predios Urbanos, sus modificaciones, y demás normas pertinentes del Código Civil de la República de Chile.`,

    `SEGUNDO (INDIVIDUALIZACIÓN DEL INMUEBLE Y DESTINO): La Parte Arrendadora otorga en arriendo temporal a la Parte Arrendataria, quien acepta en el estado material en que se encuentra y que declara conocer, el recinto ubicado en ${data.spaceAddress} ("${data.spaceTitle}"). El inmueble será destinado única y exclusivamente a: "${data.intendedUse || 'Actividades profesionales, comerciales o de trabajo legítimo'}", quedando terminantemente prohibido su uso para habitación permanente, subarrendamiento o actividades contrarias a las leyes de la República y ordenanzas municipales.`,

    `TERCERO (MODALIDAD Y PLAZO DE VIGENCIA): El presente contrato rige bajo la modalidad de arriendo ${modalityText}. La vigencia del arrendamiento comenzará a regir el ${data.startDate} y fenecerá irrevocablemente el ${data.endDate}${scheduleText}. Llegada la fecha y hora de término convenida, la Parte Arrendataria deberá hacer entrega material del recinto, desocupado de sus pertenencias y en el mismo estado de aseo y operatividad en que lo recibió, sin necesidad de notificación judicial o desahucio previo.`,

    `CUARTO (PRECIO DEL ARRIENDO Y PAGO ELECTRÓNICO): El valor total a pagar asciende a la suma de ${formatClp(data.totalClp)}, que incluye el arriendo y la comisión de servicio de la plataforma${data.guaranteeDepositClp > 0 ? ', además del depósito de garantía' : ''}, pagadero íntegramente de manera anticipada a través de Transbank (Webpay Plus o tarjeta guardada con Oneclick) en la plataforma Spotly, que actúa como mandataria para la recaudación.${discountText} La reserva solo se entiende perfeccionada una vez que Transbank autoriza el pago.`,

    data.guaranteeDepositClp > 0
      ? `QUINTO (DEPÓSITO DE GARANTÍA Y MECANISMO DE RESTITUCIÓN): Para caucionar la debida conservación del inmueble, el pago de eventuales deterioros, multas o exceso en el tiempo de ocupación, la Parte Arrendataria constituye un depósito de garantía por la suma de ${formatClp(data.guaranteeDepositClp)}. Dicha suma será restituida a la Parte Arrendataria en un plazo no superior a 48 horas hábiles tras el término del arriendo, previa verificación del estado del espacio por el propietario.`
      : `QUINTO (GARANTÍA): La Parte Arrendadora no exige depósito de garantía para este arriendo. La Parte Arrendataria responde igualmente por los daños que se causen al recinto durante el período arrendado.`,

    `SEXTO (CANCELACIÓN Y REEMBOLSO): La Parte Arrendataria podrá cancelar la reserva desde la plataforma. Con 48 horas o más de anticipación al inicio se reembolsa el 100 % del arriendo y la garantía, si la hubiere; entre 24 y 48 horas, el 50 % del arriendo y la garantía; con menos de 24 horas, solo la garantía. La comisión de servicio no es reembolsable. Si la Parte Arrendadora rechaza o cancela la reserva, se reembolsa el 100 % de lo pagado.`,

    `SÉPTIMO (CONSERVACIÓN, PROHIBICIÓN DE CESIÓN Y RESPONSABILIDAD CIVIL): La Parte Arrendataria se obliga a mantener el recinto en óptimas condiciones, velar por el cumplimiento del aforo máximo permitido, respetar las normas de copropiedad y responder íntegramente por los daños que ocasionen sus dependientes, invitados o asistentes. Queda prohibida la cesión total o parcial de este contrato, así como el subarriendo a terceros bajo cualquier título.`,

    `OCTAVO (DOMICILIO CONVENCIONAL Y JURISDICCIÓN): Para todos los efectos legales derivados de este contrato, las partes fijan su domicilio en la comuna donde se emplaza el inmueble arrendado y se someten a la competencia de los Tribunales Ordinarios de Justicia de la República de Chile.`,

    `NOVENO (FIRMA ELECTRÓNICA SIMPLE Y SELLO DE INTEGRIDAD): Conforme a la Ley N° 19.799, la firma manuscrita digitalizada capturada en la plataforma constituye una firma electrónica simple. El contenido íntegro de este instrumento (partes, montos, fechas, cláusulas, fecha de suscripción y firma) queda sellado con una huella criptográfica ${CONTRACT_HASH_ALGORITHM} indicada al pie, que permite verificar en Spotly que el documento no ha sido alterado. La suscripción se efectuó desde la dirección IP ${data.ip}.`,
  ];

  const contractHash = await computeContractHash({
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
    signatureImage: data.signatureImage,
  });

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
    hashAlgorithm: CONTRACT_HASH_ALGORITHM,
    hashVersion: CONTRACT_HASH_VERSION,
    priceUnit: data.priceUnit,
    rentalModality: data.rentalModality,
    signatureImage: data.signatureImage,
    signatureType: data.signatureType || 'digital_canvas',
    tenantSignature: {
      rut: data.tenantRut,
      fullName: data.tenantName,
      signedAt,
      ip: data.ip,
      verificationToken: `SPOTLY-${contractHash.slice(0, 12).toUpperCase()}`,
    },
  };
}
