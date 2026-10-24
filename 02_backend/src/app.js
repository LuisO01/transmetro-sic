import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import rutas from './routes.js';
import { pool } from './db/pool.js';
import { rutaNoEncontrada, manejadorErrores } from './middlewares/errores.js';

// En desarrollo la aplicacion web la sirve Vite en su propio puerto. Cuando el
// sistema se publica como un solo servicio, el compilado de Vite se entrega
// desde aqui, de modo que web y API comparten origen y no hace falta CORS.
const aqui = path.dirname(fileURLToPath(import.meta.url));
const directorioWeb = path.resolve(aqui, '..', '..', '03_frontend', 'dist');

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

  if (fs.existsSync(directorioWeb)) {
    app.use(express.static(directorioWeb, { index: false, maxAge: '1h' }));

    // El enrutamiento de la aplicacion ocurre en el navegador: cualquier ruta
    // que no sea de la API devuelve el index y React decide que pantalla toca.
    app.get(/^\/(?!api\/|salud$).*/, (_req, res, siguiente) => {
      res.sendFile(path.join(directorioWeb, 'index.html'), (error) => {
        if (error) siguiente(error);
      });
    });
    console.log(`[api] sirviendo la aplicacion web desde ${directorioWeb}`);
  }

  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);

  return app;
}
