import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.db.url,
  ssl: env.db.ssl ? { rejectUnauthorized: false } : false,
  max: env.db.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Todas las conexiones resuelven objetos en el esquema de la aplicacion
  options: `-c search_path=${env.db.schema},public`,
});

pool.on('error', (err) => {
  console.error('[db] error inesperado en el pool', err);
});

// El parametro `options` de la cadena de conexion no lo respetan todos los
// servidores, asi que el esquema se fija explicitamente al abrir cada conexion.
pool.on('connect', (cliente) => {
  cliente.query(`SET search_path = ${env.db.schema}, public`).catch((err) => {
    console.error('[db] no se pudo fijar search_path', err.message);
  });
});

/** Consulta simple fuera de transaccion (solo lecturas sin auditoria). */
export function consultar(texto, parametros = []) {
  return pool.query(texto, parametros);
}

/**
 * Ejecuta `trabajo` dentro de una transaccion y publica el usuario de la
 * sesion en el GUC `app.usuario_id`, que es de donde lo toman la bitacora de
 * auditoria (RF-16) y las columnas de trazabilidad.
 *
 * @param {number|null} usuarioId
 * @param {(cliente: import('pg').PoolClient) => Promise<any>} trabajo
 */
export async function enTransaccion(usuarioId, trabajo) {
  const cliente = await pool.connect();
  let conexionRota = false;
  try {
    await cliente.query('BEGIN');
    if (usuarioId) {
      // set_config con parametro evita cualquier riesgo de inyeccion en el GUC
      await cliente.query("SELECT set_config('app.usuario_id', $1, true)", [String(usuarioId)]);
    }
    const resultado = await trabajo(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    try {
      await cliente.query('ROLLBACK');
    } catch (errorRollback) {
      // Si ni el ROLLBACK pasa, la conexion quedo desincronizada y devolverla
      // al conjunto contagia el fallo a las siguientes peticiones. Se descarta
      // para que el conjunto abra una nueva.
      console.error('[db] el ROLLBACK fallo, se descarta la conexion:', errorRollback.message);
      conexionRota = true;
    }
    throw error;
  } finally {
    cliente.release(conexionRota);
  }
}

export async function cerrarPool() {
  await pool.end();
}
