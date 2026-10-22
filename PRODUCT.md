# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Primary: arrendatarios en Chile que buscan un espacio físico (oficina, sala de reuniones, estudio, casa, cabaña, bodega, box de consulta) para usarlo por hora, día o mes, y quieren saber al instante si está libre, cuánto cuesta y reservarlo con seguridad. El rediseño prioriza su recorrido: buscar → ver ficha → elegir horario → pagar → Mis reservas.
Secondary: propietarios que publican y administran espacios (formulario de publicación, panel con bloqueos, solicitudes y reportes) y el administrador (KYC, moderación, disputas, pagos).

## Product Purpose
Marketplace chileno para arrendar y publicar espacios físicos por hora, día o mes. Éxito: un arrendatario encuentra un espacio libre, entiende sus condiciones y termina una reserva pagada con contrato firmado sin dudas; un propietario publica y gestiona su disponibilidad sin fricción.

## Positioning
Spotly combina cuatro cosas que juntas no tiene otro sitio de arriendo en Chile:
- Disponibilidad en vivo: horas libres/ocupadas/bloqueadas actualizadas en tiempo real (Supabase Realtime), respetando el horario de apertura del espacio; reservas por hora, día o mes.
- Confianza y contrato: identidad verificada (KYC con documento y rostro), contrato firmado digitalmente en cada reserva, pago Webpay/Oneclick con reembolso automático si el anfitrión no acepta.
- Hecho para Chile: comunas, RUT, pesos chilenos con separador de miles, Webpay, hora de Chile.
- Espacios muy distintos en un solo lugar: departamentos, casas, cabañas, oficinas, trabajo compartido, salas de reuniones, consultas y boxes, bodegas, etc.

## Operating Context
- Reserva inmediata o con aprobación del anfitrión (lista de espera); resultado de pago: exitosa / lista de espera / rechazada.
- Modalidades: por hora (horario de apertura, mínimo de horas), por día, por mes.
- Mis reservas: confirmadas, lista de espera, visitas; reseñas tras terminar la reserva.
- Panel propietario: resumen, publicaciones, bloqueos por hora/día/mes, solicitudes, reportes de ingresos.
- Panel admin: KYC, espacios en moderación, disputas, transacciones, pagos, KPIs.

## Capabilities and Constraints
- Stack existente: React 19 + TypeScript + Vite 6 + Tailwind 4 + motion/react, HashRouter, Supabase, Vercel Functions. No cambiar lógica de negocio ni datos al rediseñar.
- Idioma: español de Chile.
- Las fotos de los espacios las suben los propietarios (calidad variable).

## Brand Commitments
- Nombre "Spotly" con el punto del logo como sello. Colores, tipografías y estilo pueden cambiar por completo.

## Evidence on Hand
- No hay testimonios, clientes, cifras de uso ni prensa reales: no inventar ninguno. Las cifras visibles salen solo de datos reales de la plataforma.

## Product Principles
1. La disponibilidad real se muestra antes que la promesa: el usuario ve horas libres, no texto.
2. Confianza visible en cada paso: verificación, contrato y pago protegido explicados donde importan.
3. Chile primero: formatos, lenguaje y medios de pago locales.
4. Reservar en pocos pasos, sin sorpresas de horario ni precio.

## Accessibility & Inclusion
WCAG 2.1 AA como mínimo; respetar prefers-reduced-motion (ya implementado globalmente).

## Visual Preference (brand commitment)
- El usuario eligió el estándar del rubro (marketplace limpio), con la calidad de Airbnb, Peerspace, Booking y Apple/Linear como vara, y pidió transiciones y efectos que se sientan nuevos.
