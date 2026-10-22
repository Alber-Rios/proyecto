---
version: 1
slug: "src-pages-homepage-tsx"
primary_target: "src/pages/HomePage.tsx"
related_targets: ["src/pages/SpaceDetailPage.tsx","src/components/SpaceCard.tsx"]
---

# Spotly · rediseño completo (portada como superficie principal)

Scope: todas las vistas; portada (Persuade) y ficha/reserva (Operate) llevan el peso. Usuario principal: arrendatario.
Chosen: estándar del rubro (canon) a vara Airbnb / Peerspace / Booking / Apple-Linear, más transiciones propias pedidas por el usuario.
Memorable moment: cada tarjeta muestra las horas libres de hoy en vivo y se expande hacia la ficha con una transición de elemento compartido.

## Direction contract
THESIS: Marketplace limpio y fotográfico donde la disponibilidad real es lo primero que se ve; rechaza el hero oscuro con titular serif en cursiva y el catálogo de tarjetas genéricas sin datos vivos.
OWN-WORLD: Fondo blanco, neutros fríos levemente azulados, un solo acento cobalto (el punto de Spotly), verde solo para "libre". Tipografía Onest variable, titulares 600 con tracking -0.03em, cifras tabulares. Radios 14–24px, sombras suaves con desplazamiento, fotos a sangre en las tarjetas.
STORY: El arrendatario entiende en segundos qué puede arrendar y dónde, ve qué está libre hoy, abre una ficha y reserva por hora/día/mes con contrato y pago protegido.
FIRST VIEWPORT: Titular corto a la izquierda arriba, buscador funcional grande (dónde · cuándo · modalidad · buscar) como pieza central, riel de categorías con íconos debajo, y el inicio de la grilla de espacios visible en el primer pantallazo.
FORM: canon (salida estándar del rubro, elegida por el usuario); seed: seed:6a4e515b6dde27b5
SIGNATURE: tira de disponibilidad de hoy en cada tarjeta + transición compartida foto tarjeta→ficha (View Transitions) + selección de horas arrastrando en la ficha. Motion: ease-out fuerte, resortes Apple (bounce ≤0.2), <300ms en UI.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
