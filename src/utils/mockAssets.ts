/**
 * Generador de imágenes simuladas (SVG Data URLs) para pruebas y demostraciones de Cédula de Identidad y Reconocimiento Facial en Chile.
 */

export function getSimulatedCedulaImage(
  side: 'front' | 'back',
  fullName = 'JUAN CARLOS PEREZ TAPIA',
  rut = '18.942.103-K'
): string {
  const serialNumber = '509.281.392';
  
  if (side === 'front') {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
      <defs>
        <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#e0f2fe"/>
          <stop offset="50%" stop-color="#bae6fd"/>
          <stop offset="100%" stop-color="#7dd3fc"/>
        </linearGradient>
        <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#0284c7"/>
          <stop offset="100%" stop-color="#0369a1"/>
        </linearGradient>
      </defs>
      
      <!-- Base de Tarjeta -->
      <rect width="800" height="500" rx="30" fill="url(#cardBg)" stroke="#0284c7" stroke-width="4"/>
      
      <!-- Fondo Microimpresión / Seguridad -->
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#38bdf8" stroke-width="0.5" opacity="0.4"/>
      </pattern>
      <rect width="800" height="500" rx="30" fill="url(#grid)"/>
      
      <!-- Encabezado Oficial -->
      <rect x="0" y="0" width="800" height="90" fill="url(#headerGrad)"/>
      <text x="30" y="38" fill="#ffffff" font-family="sans-serif" font-size="20" font-weight="bold" letter-spacing="1">REPÚBLICA DE CHILE</text>
      <text x="30" y="65" fill="#e0f2fe" font-family="sans-serif" font-size="14">SERVICIO DE REGISTRO CIVIL E IDENTIFICACIÓN</text>
      <text x="770" y="52" fill="#ffffff" font-family="sans-serif" font-size="22" font-weight="900" text-anchor="end">CÉDULA DE IDENTIDAD</text>
      
      <!-- Foto de Perfil Simulada -->
      <rect x="40" y="120" width="220" height="280" rx="16" fill="#f1f5f9" stroke="#0284c7" stroke-width="3"/>
      <!-- Silueta de Rostro en la Foto -->
      <circle cx="150" cy="220" r="50" fill="#cbd5e1"/>
      <path d="M 80 370 C 80 290, 220 290, 220 370 Z" fill="#cbd5e1"/>
      <text x="150" y="385" fill="#0369a1" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">REGISTRO CIVIL CHILE</text>

      <!-- Escudo / Estrella de Chile de fondo -->
      <polygon points="700,200 715,245 760,245 725,270 740,315 700,285 660,315 675,270 640,245 685,245" fill="#0284c7" opacity="0.12"/>
      
      <!-- Datos Principales -->
      <g font-family="sans-serif" fill="#0f172a">
        <!-- RUN / RUT -->
        <text x="290" y="145" fill="#0369a1" font-size="14" font-weight="bold">RUN / RUT</text>
        <text x="290" y="180" font-size="32" font-weight="900" fill="#0369a1" letter-spacing="1">${rut}</text>
        
        <!-- APELLIDOS Y NOMBRES -->
        <text x="290" y="220" fill="#64748b" font-size="13" font-weight="bold">APELLIDOS / NOMBRES</text>
        <text x="290" y="248" font-size="22" font-weight="800">${fullName}</text>
        
        <!-- NACIONALIDAD Y SEXO -->
        <text x="290" y="290" fill="#64748b" font-size="12" font-weight="bold">NACIONALIDAD</text>
        <text x="290" y="315" font-size="16" font-weight="bold">CHILENA</text>
        
        <text x="500" y="290" fill="#64748b" font-size="12" font-weight="bold">SEXO</text>
        <text x="500" y="315" font-size="16" font-weight="bold">M</text>
        
        <!-- FECHA NACIMIENTO Y N° DOCUMENTO -->
        <text x="290" y="360" fill="#64748b" font-size="12" font-weight="bold">FECHA NACIMIENTO</text>
        <text x="290" y="385" font-size="16" font-weight="bold">12 MAY 1994</text>
        
        <text x="500" y="360" fill="#64748b" font-size="12" font-weight="bold">N° DOCUMENTO</text>
        <text x="500" y="385" font-size="18" font-weight="900" fill="#e11d48">${serialNumber}</text>
      </g>
      
      <!-- Pie con Firma y Holograma -->
      <line x1="40" y1="435" x2="760" y2="435" stroke="#0284c7" stroke-width="2" stroke-dasharray="8 4"/>
      <text x="40" y="470" fill="#0369a1" font-family="sans-serif" font-size="13" font-weight="bold">DOCUMENTO CHILENO OFICIAL DE PRUEBA SPOTLY</text>
      <text x="760" y="470" fill="#64748b" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="end">VENCIMIENTO: 15 NOV 2029</text>
    </svg>`;
    
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  } else {
    // REVERSO
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
      <defs>
        <linearGradient id="cardBgBack" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f0f9ff"/>
          <stop offset="100%" stop-color="#bae6fd"/>
        </linearGradient>
      </defs>

      <rect width="800" height="500" rx="30" fill="url(#cardBgBack)" stroke="#0284c7" stroke-width="4"/>

      <!-- Encabezado Reverso -->
      <rect x="0" y="0" width="800" height="60" fill="#0369a1"/>
      <text x="40" y="38" fill="#ffffff" font-family="sans-serif" font-size="18" font-weight="bold">CÉDULA DE IDENTIDAD - REVERSO (CHILE)</text>
      <text x="760" y="38" fill="#e0f2fe" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="end">FOLIO: ${serialNumber}</text>

      <!-- Cuadro de Huella Dactilar -->
      <rect x="40" y="90" width="160" height="200" rx="12" fill="#ffffff" stroke="#0284c7" stroke-width="2"/>
      <path d="M 120 130 C 90 130 90 250 120 250 C 150 250 150 130 120 130 Z" fill="none" stroke="#0284c7" stroke-width="3" stroke-dasharray="5 3"/>
      <text x="120" y="275" fill="#0369a1" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">HUELLA DACTILAR</text>

      <!-- Código PDF417 de barras simulado -->
      <rect x="230" y="90" width="530" height="110" fill="#0f172a" rx="8"/>
      <!-- Líneas de código de barras -->
      <g fill="#ffffff">
        <rect x="240" y="100" width="6" height="90"/>
        <rect x="250" y="100" width="12" height="90"/>
        <rect x="268" y="100" width="4" height="90"/>
        <rect x="278" y="100" width="16" height="90"/>
        <rect x="300" y="100" width="8" height="90"/>
        <rect x="314" y="100" width="14" height="90"/>
        <rect x="334" y="100" width="5" height="90"/>
        <rect x="345" y="100" width="20" height="90"/>
        <rect x="370" y="100" width="10" height="90"/>
        <rect x="385" y="100" width="15" height="90"/>
        <rect x="405" y="100" width="8" height="90"/>
        <rect x="420" y="100" width="18" height="90"/>
        <rect x="445" y="100" width="6" height="90"/>
        <rect x="458" y="100" width="22" height="90"/>
        <rect x="485" y="100" width="12" height="90"/>
        <rect x="502" y="100" width="8" height="90"/>
        <rect x="515" y="100" width="25" height="90"/>
        <rect x="545" y="100" width="14" height="90"/>
        <rect x="565" y="100" width="9" height="90"/>
        <rect x="580" y="100" width="18" height="90"/>
        <rect x="605" y="100" width="11" height="90"/>
        <rect x="622" y="100" width="20" height="90"/>
        <rect x="648" y="100" width="7" height="90"/>
        <rect x="660" y="100" width="15" height="90"/>
        <rect x="680" y="100" width="10" height="90"/>
        <rect x="695" y="100" width="22" height="90"/>
        <rect x="722" y="100" width="8" height="90"/>
        <rect x="735" y="100" width="15" height="90"/>
      </g>

      <!-- Firma del Titular -->
      <rect x="230" y="220" width="530" height="120" rx="12" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
      <text x="250" y="245" fill="#64748b" font-family="sans-serif" font-size="12" font-weight="bold">FIRMA DEL TITULAR</text>
      <!-- Script de Firma simulado -->
      <path d="M 270 300 Q 340 240, 420 290 T 550 260 T 680 295" fill="none" stroke="#0f172a" stroke-width="4" stroke-linecap="round"/>

      <!-- Datos adicionales -->
      <g font-family="sans-serif" fill="#334155" font-size="13" font-weight="bold">
        <text x="40" y="380">COMUNA: SANTIAGO</text>
        <text x="40" y="410">PROFESIÓN: ARRENDADOR / USUARIO REGISTRADO</text>
        <text x="40" y="440">OFICINA EMISORA: REGISTRO CIVIL SANTIAGO CENTRO</text>
      </g>
      
      <!-- Marca de seguridad -->
      <rect x="0" y="475" width="800" height="25" fill="#0369a1"/>
      <text x="400" y="492" fill="#ffffff" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">MUESTRA SIMULADA PARA AUDITORÍA DE PRUEBAS SPOTLY CHILE</text>
    </svg>`;

    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }
}

export function getSimulatedFaceImage(fullName = 'JUAN CARLOS PEREZ TAPIA'): string {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#1e293b"/>
      </linearGradient>
      <linearGradient id="faceGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#fde047"/>
        <stop offset="100%" stop-color="#eab308"/>
      </linearGradient>
    </defs>

    <rect width="600" height="600" fill="url(#bgGrad)"/>

    <!-- Red de Puntos Malla Biométrica Facial (Biometric Grid) -->
    <ellipse cx="300" cy="280" rx="150" ry="200" fill="none" stroke="#10b981" stroke-width="3" stroke-dasharray="6 4" opacity="0.8"/>
    
    <!-- Rostro Vectorial -->
    <ellipse cx="300" cy="270" rx="110" ry="140" fill="#e2e8f0"/>
    <!-- Ojos -->
    <ellipse cx="250" cy="240" rx="18" ry="10" fill="#0f172a"/>
    <circle cx="250" cy="240" r="6" fill="#38bdf8"/>
    <ellipse cx="350" cy="240" rx="18" ry="10" fill="#0f172a"/>
    <circle cx="350" cy="240" r="6" fill="#38bdf8"/>
    <!-- Nariz -->
    <path d="M 300 240 L 290 285 L 310 285" fill="none" stroke="#64748b" stroke-width="4" stroke-linecap="round"/>
    <!-- Sonrisa -->
    <path d="M 260 330 Q 300 360, 340 330" fill="none" stroke="#0f172a" stroke-width="5" stroke-linecap="round"/>

    <!-- Puntos Malla Múltiples (Nodes) -->
    <circle cx="250" cy="240" r="4" fill="#10b981"/>
    <circle cx="350" cy="240" r="4" fill="#10b981"/>
    <circle cx="300" cy="285" r="4" fill="#10b981"/>
    <circle cx="260" cy="330" r="4" fill="#10b981"/>
    <circle cx="340" cy="330" r="4" fill="#10b981"/>
    <circle cx="300" cy="380" r="4" fill="#10b981"/>
    <circle cx="190" cy="270" r="4" fill="#10b981"/>
    <circle cx="410" cy="270" r="4" fill="#10b981"/>

    <!-- Conexiones Láser -->
    <line x1="250" y1="240" x2="350" y2="240" stroke="#10b981" stroke-width="1.5" stroke-dasharray="4 2"/>
    <line x1="250" y1="240" x2="300" y2="285" stroke="#10b981" stroke-width="1.5"/>
    <line x1="350" y1="240" x2="300" y2="285" stroke="#10b981" stroke-width="1.5"/>
    <line x1="300" y1="285" x2="300" y2="380" stroke="#10b981" stroke-width="1.5"/>

    <!-- Banner de Verificación Biométrica -->
    <rect x="50" y="500" width="500" height="60" rx="16" fill="#065f46" stroke="#10b981" stroke-width="2"/>
    <text x="300" y="525" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle">VERIFICACIÓN BIOMÉTRICA EN VIVO - RECONOCIMIENTO OK</text>
    <text x="300" y="548" fill="#a7f3d0" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">COINCIDENCIA FACIAL: 97.8% | LIVENESS: PASADO (100% HUMANO)</text>
  </svg>`;

  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}
