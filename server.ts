import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import cors from 'cors';
import webpayHandler from './api/webpay.ts';
import clientIpHandler from './api/client-ip.ts';
import authHandler from './api/auth.ts';
import { buildCsp, SECURITY_HEADERS } from './api/_security.ts';
import walletHandler from './api/wallet.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Habilitar CORS para permitir llamadas tanto locales como desde despliegues (Vercel, etc.)
  app.disable('x-powered-by');
  // Por defecto la web y la API comparten dominio y no hace falta CORS. Si la API va
  // separada, CORS_ORIGIN debe ser el dominio exacto del frontend (nunca "*" con cookies).
  const corsOrigin = process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*' ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : false;
  app.use(
    cors({
      origin: corsOrigin,
      credentials: Boolean(corsOrigin),
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Spotly-Request'],
    })
  );

  app.use(express.json({ limit: '1mb' }));
  // Transbank retorna a /api/webpay con un formulario url-encoded.
  app.use(express.urlencoded({ extended: false }));

  // Cabeceras de seguridad (RNF-05). En Vercel se definen en vercel.json.
  const isProd = process.env.NODE_ENV === 'production';
  // En producción también se permite el dominio de Supabase configurado (por si no es *.supabase.co).
  const supabaseOrigin = (() => {
    try {
      const u = new URL(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '');
      return [u.origin, u.origin.replace(/^http/, 'ws')];
    } catch {
      return [];
    }
  })();
  const csp = buildCsp({ connect: supabaseOrigin, img: supabaseOrigin.slice(0, 1) });
  const cspHttp = buildCsp({ connect: supabaseOrigin, img: supabaseOrigin.slice(0, 1), upgrade: false });
  app.use((req, res, next) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      if (k === 'Strict-Transport-Security' && !isProd) continue;
      res.setHeader(k, v);
    }
    // En desarrollo Vite inyecta scripts en línea (recarga en caliente): la CSP solo se aplica en producción.
    if (isProd) {
      const https = req.secure || String(req.headers['x-forwarded-proto'] || '').startsWith('https');
      res.setHeader('Content-Security-Policy', https ? csp : cspHttp);
    }
    next();
  });

  // Pagos Webpay Plus e IP del cliente: mismos handlers que las Vercel Functions.
  app.all('/api/webpay', (req, res) => webpayHandler(req as any, res as any));
  app.get('/api/client-ip', (req, res) => clientIpHandler(req as any, res as any));
  app.all('/api/auth', (req, res) => authHandler(req as any, res as any));
  app.all('/api/wallet', (req, res) => walletHandler(req as any, res as any));

  // Endpoint de salud del servidor
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Spotly API',
      timestamp: new Date().toISOString(),
    });
  });

  // API Route: Verificación Automatizada KYC con Gemini AI (Cédula OCR + Reconocimiento Facial)
  // Integración Middleware de Vite / Servidor Estático
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor Spotly corriendo en http://localhost:${PORT}`);
  });
}

startServer();
