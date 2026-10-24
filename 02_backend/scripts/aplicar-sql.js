/**
 * Aplica los scripts de 01_database en orden contra la base indicada por
 * DATABASE_URL. Sustituye a psql cuando este no esta instalado.
 *
 *   node scripts/aplicar-sql.js            -> aplica 01..11
 *   node scripts/aplicar-sql.js --reset    -> aplica 00 (drop) y luego 01..11
 *   node scripts/aplicar-sql.js --sin-seed -> omite 11_seed.sql
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const aqui = path.dirname(fileURLToPath(import.meta.url));
const directorioSql = path.resolve(aqui, '..', '..', '01_database');

const reset = process.argv.includes('--reset');
const sinSeed = process.argv.includes('--sin-seed');

function archivos() {
  return fs
    .readdirSync(directorioSql)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => (f.startsWith('00_') ? reset : true))
    .filter((f) => !(sinSeed && f.includes('seed')));
}

async function principal() {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL. Copie .env.example a .env y complete la cadena de conexion.');
    process.exit(1);
  }

  const cliente = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await cliente.connect();
  console.log(`[sql] conectado. Aplicando scripts de ${directorioSql}`);

  for (const nombre of archivos()) {
    const ruta = path.join(directorioSql, nombre);
    // Los meta-comandos de psql (\echo) no los entiende el protocolo simple
    const sql = fs
      .readFileSync(ruta, 'utf8')
      .split('\n')
      .filter((linea) => !linea.trimStart().startsWith('\\'))
      .join('\n');

    process.stdout.write(`[sql] ${nombre} ... `);
    try {
      await cliente.query(sql);
      console.log('ok');
    } catch (error) {
      console.log('ERROR');
      console.error(`\n  ${error.message}`);
      if (error.position) {
        const hasta = sql.slice(0, Number(error.position));
        console.error(`  linea aproximada: ${hasta.split('\n').length}`);
      }
      await cliente.end();
      process.exit(1);
    }
  }

  await cliente.end();
  console.log('[sql] listo');
}

principal().catch((error) => {
  console.error(error);
  process.exit(1);
});
