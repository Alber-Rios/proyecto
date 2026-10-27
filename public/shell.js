// Pantalla de carga: la portada de ejemplo solo se muestra en el inicio.
// (Archivo externo para cumplir la Content-Security-Policy sin scripts en línea.)
if (location.pathname !== '/') { var h = document.getElementById('shell-hero'); if (h) h.remove(); }
