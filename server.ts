import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import cors from 'cors';
import webpayHandler from './api/webpay.ts';
import clientIpHandler from './api/client-ip.ts';
import authHandler from './api/auth.ts';
import walletHandler from './api/wallet.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Habilitar CORS para permitir llamadas tanto locales como desde despliegues (Vercel, etc.)
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.use(express.json({ limit: '1mb' }));
  // Transbank retorna a /api/webpay con un formulario url-encoded.
  app.use(express.urlencoded({ extended: false }));

  // Cabeceras de seguridad (RNF-05). En Vercel se definen en vercel.json.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
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
