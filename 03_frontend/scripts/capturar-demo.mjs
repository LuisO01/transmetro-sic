/**
 * Captura las respuestas reales de la API para la version de demostracion.
 *
 * GitHub Pages solo sirve archivos: no ejecuta Node ni la base de datos. Para
 * que el sitio publicado muestre el sistema con datos verdaderos, este guion
 * inicia sesion con cada una de las cinco cuentas de ejemplo contra la API en
 * ejecucion, consulta todo lo que la aplicacion web pide y guarda cada
 * respuesta en public/demo/<usuario>.json.
 *
 * Lo que queda publicado es de solo lectura: las operaciones de escritura las
 * rechaza el cliente de demostracion con un mensaje, porque no hay servidor
 * detras que las pueda garantizar.
 *
 *   node scripts/capturar-demo.mjs [http://127.0.0.1:4000]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = (process.argv[2] ?? 'http://127.0.0.1:4000').replace(/\/$/, '') + '/api/v1';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const salida = path.resolve(aqui, '..', 'public', 'demo');

const CUENTAS = ['admin.general', 'admin.muni.gt', 'operador.e103', 'piloto.001', 'guardia.001'];
const PASSWORD = 'Transmetro2026*';

// Lo que piden las pantallas, incluidas las variantes de filtro que arma la
// aplicacion. Las rutas a las que un rol no tiene acceso se omiten solas.
const RUTAS_FIJAS = [
  '/auth/perfil',
  '/municipalidades',
  '/tablero/mapa',
  '/tablero/indicadores',
  '/lineas',
  '/lineas?limite=100',
  '/lineas?estado=activa&limite=50',
  '/estaciones',
  '/estaciones?limite=100',
  '/estaciones?limite=200',
  '/estaciones?estado=operativa',
  '/buses',
  '/buses?limite=100',
  '/parqueos/predios',
  '/parqueos/sin-parqueo',
  '/alertas',
  '/alertas?limite=6',
  '/alertas?limite=100',
  '/alertas/resumen',
  '/monitoreo/resumen',
  '/monitoreo/anden',
  '/monitoreo/unidades-disponibles',
  '/monitoreo/mis-viajes',
  '/personal/resumen',
  '/personal/pilotos',
  '/personal/guardias',
  '/personal/turnos',
  '/personal/cobertura?soloIncumplidos=true',
  '/personal/mi-expediente',
  '/personal/mi-cobertura',
  '/usuarios?limite=100',
  '/usuarios/matriz-permisos',
];

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

/**
 * La API limita las peticiones por minuto, que es justo lo que esta captura
 * hace en rafaga. Ante un 429 se espera y se reintenta en vez de abandonar.
 */
// La API admite 300 peticiones por minuto; se va por debajo a proposito para
// no provocar el rechazo en lugar de tener que recuperarse de el.
const PAUSA_ENTRE_PETICIONES = 260;

async function conReintento(hacer, intentos = 10) {
  for (let i = 1; i <= intentos; i++) {
    await esperar(PAUSA_ENTRE_PETICIONES);
    const respuesta = await hacer();
    if (respuesta.status !== 429) return respuesta;
    process.stdout.write('  (limite de peticiones alcanzado, esperando 30 s)\n');
    await esperar(30_000);
  }
  throw new Error('la API sigue rechazando por limite de peticiones');
}

async function pedir(ruta, token) {
  const respuesta = await conReintento(() => fetch(API + ruta, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }));
  const cuerpo = await respuesta.json().catch(() => null);
  return { estado: respuesta.status, cuerpo };
}

async function entrar(usuario) {
  const respuesta = await conReintento(() => fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password: PASSWORD }),
  }));
  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    throw new Error(`no se pudo iniciar sesion como ${usuario} (${respuesta.status}) ${detalle.slice(0, 120)}`);
  }
  const { datos } = await respuesta.json();
  return datos;
}

/** Identificadores reales, para capturar tambien las pantallas de detalle. */
async function identificadores(token) {
  const lista = async (ruta, campo = 'items') => {
    const { estado, cuerpo } = await pedir(ruta, token);
    if (estado !== 200) return [];
    const datos = cuerpo?.[campo] ?? cuerpo?.datos ?? [];
    return Array.isArray(datos) ? datos.map((d) => d.id).filter(Boolean) : [];
  };
  return {
    lineas: await lista('/lineas?limite=100'),
    estaciones: await lista('/estaciones?limite=200'),
    predios: await lista('/parqueos/predios', 'datos'),
    pilotos: await lista('/personal/pilotos', 'datos'),
  };
}

fs.mkdirSync(salida, { recursive: true });
const resumen = [];

for (const usuario of CUENTAS) {
  const sesion = await entrar(usuario);
  const token = sesion.accessToken;
  const ids = await identificadores(token);

  const rutas = [...RUTAS_FIJAS];
  for (const id of ids.lineas) {
    rutas.push(`/lineas/${id}`, `/lineas/${id}/unidades`,
      `/lineas/${id}/recorrido?sentido=ida`, `/lineas/${id}/recorrido?sentido=vuelta`);
  }
  for (const id of ids.estaciones) {
    rutas.push(`/estaciones/${id}`, `/estaciones/${id}/accesos`);
    // El selector de estacion del monitoreo consulta cualquiera de ellas
    rutas.push(`/monitoreo/resumen?estacionId=${id}`, `/monitoreo/anden?estacionId=${id}`,
      `/monitoreo/unidades-disponibles?estacionId=${id}`);
  }
  for (const id of ids.predios) {
    rutas.push(`/parqueos/predios/${id}/espacios`, `/parqueos/predios/${id}/espacios?soloDisponibles=true`);
  }
  for (const id of ids.pilotos) rutas.push(`/personal/pilotos/${id}`);

  const respuestas = {};
  let omitidas = 0;
  for (const ruta of [...new Set(rutas)]) {
    const { estado, cuerpo } = await pedir(ruta, token);
    if (estado === 200) respuestas[ruta] = cuerpo;
    else omitidas++;
  }

  const archivo = path.join(salida, `${usuario}.json`);
  fs.writeFileSync(archivo, JSON.stringify({ usuario: sesion.usuario, respuestas }));
  const kb = (fs.statSync(archivo).size / 1024).toFixed(0);
  console.log(`${usuario.padEnd(15)} ${String(Object.keys(respuestas).length).padStart(4)} respuestas  ${String(omitidas).padStart(3)} sin acceso  ${kb} KB`);
  resumen.push({ usuario, respuestas: Object.keys(respuestas).length, kb: Number(kb) });
}

fs.writeFileSync(path.join(salida, 'indice.json'), JSON.stringify({
  generado: new Date().toISOString(),
  cuentas: CUENTAS,
  password: PASSWORD,
}, null, 2));

console.log(`\ntotal ${resumen.reduce((s, r) => s + r.kb, 0)} KB en ${salida}`);
