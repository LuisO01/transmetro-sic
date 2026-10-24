/**
 * Arranque del sitio publicado: un solo proceso con la base, la API y la web.
 *
 * En la nube no hay un PostgreSQL administrado contratado, de modo que la
 * demostración usa el mismo PGlite del desarrollo local: se levanta dentro de
 * este proceso, hablando el protocolo de PostgreSQL en 127.0.0.1, y la API se
 * conecta a él igual que a un servidor real. El esquema y los datos de ejemplo
 * se aplican en cada arranque, por lo que el sitio siempre parte del mismo
 * estado conocido y lo que un visitante modifique se descarta al reiniciar.
 *
 * Para una operación real se cambia DATABASE_URL por la de un PostgreSQL
 * administrado y se arranca con `npm start`, sin pasar por este guion.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const directorioSql = path.resolve(aqui, '..', '..', '01_database');
const puerto = Number(process.env.PGLITE_PORT ?? 5433);

// Carpeta efímera: el sistema de archivos del plan gratuito no sobrevive a un
// reinicio, así que se parte siempre del guion de carga en lugar de fingir
// persistencia.
const directorioDatos = fs.mkdtempSync(path.join(os.tmpdir(), 'transmetro-'));

const db = new PGlite({
  dataDir: directorioDatos,
  extensions: { btree_gist, citext, pgcrypto },
});
await db.waitReady;

const archivos = fs.readdirSync(directorioSql)
  .filter((f) => /^\d\d_.*\.sql$/.test(f) && !f.startsWith('00_'))
  .sort();

console.log(`[demo] aplicando ${archivos.length} guiones de 01_database`);
for (const nombre of archivos) {
  // Los meta-comandos de psql (\echo) no son parte del protocolo
  const sql = fs.readFileSync(path.join(directorioSql, nombre), 'utf8')
    .split('\n')
    .filter((linea) => !linea.trimStart().startsWith('\\'))
    .join('\n');
  await db.exec(sql);
}

const servidorBd = new PGLiteSocketServer({ db, port: puerto, host: '127.0.0.1' });
await servidorBd.start();

const { rows } = await db.query(
  `SELECT (SELECT count(*) FROM transmetro.linea) lineas,
          (SELECT count(*) FROM transmetro.bus) buses,
          (SELECT count(*) FROM transmetro.usuario) usuarios`,
);
console.log(`[demo] base lista en 127.0.0.1:${puerto}: ${rows[0].lineas} lineas, ${rows[0].buses} unidades, ${rows[0].usuarios} usuarios`);

// La API se importa después de que la base responde, para que su verificación
// de conexión al arrancar encuentre el motor en pie.
await import('../src/server.js');

const apagar = async () => {
  await servidorBd.stop();
  await db.close();
  fs.rmSync(directorioDatos, { recursive: true, force: true });
};
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
