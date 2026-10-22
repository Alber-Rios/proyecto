# Spotly — guía para Claude

Stack: React 19 + TypeScript + Vite 6 + Tailwind 4 + motion/react, Supabase (schema único en `supabase/reset-and-setup.sql`), Vercel Functions en `api/`.

## Diseño y animación
Para cualquier trabajo de UI usa los skills de `.claude/skills/`:
- `impeccable`: dirección de diseño, auditoría, pulido, accesibilidad (`/impeccable audit`, `/impeccable polish`…).
- `taste-skill` (design-taste-frontend): evitar el look genérico de IA, tipografía, color, layout.
- `emil-design-eng`, `animate`, `review-animations`, `improve-animations`, `animation-performance`: criterio de Emil Kowalski para animaciones y detalles de UI.

## MCP (`.mcp.json`)
- `figma`: MCP oficial de Figma (pide iniciar sesión la primera vez).
- `playwright`: navegador para probar y sacar capturas de la app (`npm run dev`).

## Verificación
`npx tsc --noEmit`, `npx vitest run`, `npm run build`.
