/**
 * Base de datos local para desarrollo y demostración, sin instalar PostgreSQL.
 *
 * PGlite es PostgreSQL compilado a WebAssembly; este guion lo expone en un
 * puerto TCP hablando el protocolo de PostgreSQL, de modo que la API se conecta
 * igual que a un servidor real. Los datos se guardan en 02_backend/.datos-pglite
 * y sobreviven entre arranques.
 *
 *   node scripts/servidor-pglite.js            arranca en el puerto 5433
 *   node scripts/servidor-pglite.js --reset    borra los datos y aplica el script
 *
 * NO sustituye a PostgreSQL en produccion: es una conveniencia de desarrollo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const directorioDatos = path.resolve(aqui, '..', '.datos-pglite');
const directorioSql = path.resolve(aqui, '..', '..', '01_database');
const puerto = Number(process.env.PGLITE_PORT ?? 5433);
const reset = process.argv.includes('--reset');

if (reset && fs.existsSync(directorioDatos)) {
  fs.rmSync(directorioDatos, { recursive: true, force: true });
  console.log('[pglite] datos anteriores eliminados');
}

const esNueva = !fs.existsSync(directorioDatos);

const db = new PGlite({
  dataDir: directorioDatos,
  extensions: { btree_gist, citext, pgcrypto },
});
await db.waitReady;

if (esNueva) {
  console.log('[pglite] base nueva: aplicando los scripts de 01_database');
  const archivos = fs.readdirSync(directorioSql)
    .filter((f) => /^\d\d_.*\.sql$/.test(f) && !f.startsWith('00_'))
    .sort();

  for (const nombre of archivos) {
    // Los meta-comandos de psql (\echo) no son parte del protocolo
    const sql = fs.readFileSync(path.join(directorioSql, nombre), 'utf8')
      .split('\n')
      .filter((linea) => !linea.trimStart().startsWith('\\'))
      .join('\n');

    process.stdout.write(`[pglite] ${nombre} ... `);
    await db.exec(sql);
    console.log('ok');
  }
}

const servidor = new PGLiteSocketServer({ db, port: puerto, host: '127.0.0.1' });
await servidor.start();

const { rows } = await db.query(
  `SELECT (SELECT count(*) FROM transmetro.linea) lineas,
          (SELECT count(*) FROM transmetro.bus) buses,
          (SELECT count(*) FROM transmetro.usuario) usuarios`,
);

console.log(`[pglite] escuchando en 127.0.0.1:${puerto}`);
console.log(`[pglite] datos: ${rows[0].lineas} lineas, ${rows[0].buses} unidades, ${rows[0].usuarios} usuarios`);
console.log('[pglite] cadena de conexion: postgresql://postgres:postgres@localhost:' + puerto + '/postgres');

const apagar = async () => {
  await servidor.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
