import type { VercelRequest, VercelResponse } from '@vercel/node';

// IP pública del cliente según la red de borde (se consigna en el contrato firmado).
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Cache-Control', 'no-store');
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '');
  const ip = forwarded.split(',')[0].trim() || req.socket?.remoteAddress || '';
  return res.status(200).json({ ip: ip || null });
}
