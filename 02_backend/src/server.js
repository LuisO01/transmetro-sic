import { crearApp } from './app.js';
import { env } from './config/env.js';
import { pool, cerrarPool } from './db/pool.js';

const app = crearApp();

const servidor = app.listen(env.puerto, () => {
  console.log(`[api] SIC Transmetro escuchando en http://localhost:${env.puerto} (${env.nodeEnv})`);
  console.log(`[api] Salud: http://localhost:${env.puerto}/salud`);
});

// Verificacion temprana de la conexion: mejor fallar al arrancar que en la
// primera peticion del usuario.
pool
  .query('SELECT current_database() AS bd, current_schema() AS esquema')
  .then(({ rows }) => console.log(`[db] conectado a ${rows[0].bd}, esquema ${rows[0].esquema}`))
  .catch((error) => console.error('[db] no se pudo conectar:', error.message));

async function apagar(senal) {
  console.log(`[api] recibida ${senal}, cerrando de forma ordenada...`);
  servidor.close(async () => {
    await cerrarPool();
    process.exit(0);
  });
  // Salida forzada si alguna conexion queda colgada
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
