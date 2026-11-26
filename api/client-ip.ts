import type { VercelRequest, VercelResponse } from '@vercel/node';

// CORS: la web llama desde el mismo dominio; solo se abre a los orígenes de CORS_ORIGIN
// (lista separada por comas; "*" se ignora). Sin origen permitido no se envía la cabecera.
function applyCors(req: VercelRequest, res: VercelResponse, methods = 'GET,POST,OPTIONS'): void {
  const origin = String(req.headers.origin || '');
  const allowed = (process.env.CORS_ORIGIN || '').split(',').map((x) => x.trim()).filter((x) => x && x !== '*');
  res.setHeader('Vary', 'Origin');
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}


// IP pública del cliente según la red de borde (se consigna en el contrato firmado).
export default function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res, 'GET,OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '');
  const ip = forwarded.split(',')[0].trim() || req.socket?.remoteAddress || '';
  return res.status(200).json({ ip: ip || null });
}
