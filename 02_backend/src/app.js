import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import rutas from './routes.js';
import { pool } from './db/pool.js';
import { rutaNoEncontrada, manejadorErrores } from './middlewares/errores.js';

export function crearApp() {
  const app = express();

  // Detras de un balanceador o proxy, para que req.ip sea la IP real del cliente
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(env.esProduccion ? 'combined' : 'dev'));

  // Limite general de peticiones (el login tiene uno mas estricto)
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );

  /** Sonda de salud: incluye la base, para el RNF de disponibilidad >= 99 %. */
  app.get('/salud', async (_req, res) => {
    try {
      const inicio = Date.now();
      await pool.query('SELECT 1');
      res.json({
        ok: true,
        servicio: 'transmetro-sic-api',
        ambiente: env.nodeEnv,
        baseDatos: 'conectada',
        latenciaMs: Date.now() - inicio,
        fecha: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({ ok: false, baseDatos: 'sin conexion', detalle: error.message });
    }
  });

  app.use('/api/v1', rutas);

  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);

  return app;
}
