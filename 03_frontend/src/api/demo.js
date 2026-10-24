/**
 * Cliente de demostracion para el sitio publicado en GitHub Pages.
 *
 * Pages solo sirve archivos: no hay API ni base de datos detras. Este modulo
 * ocupa el lugar del cliente HTTP y responde con las respuestas reales que
 * `scripts/capturar-demo.mjs` capturo de la API en ejecucion, una coleccion por
 * cada cuenta de ejemplo. La aplicacion no se entera: recibe exactamente los
 * mismos cuerpos que recibiria del servidor.
 *
 * Es de solo lectura por una razon de fondo: las reglas de negocio de este
 * sistema viven en PostgreSQL, y sin motor detras no hay quien las garantice.
 * Antes que fingir que una operacion se guardo, se rechaza con un mensaje.
 */
import { ErrorApi, almacenTokens } from './cliente.js';

const PREFIJO = 'demo:';
const PASSWORD = 'Transmetro2026*';
const RAIZ = `${import.meta.env.BASE_URL}demo/`;

const paquetes = new Map();

async function paqueteDe(usuario) {
  if (!paquetes.has(usuario)) {
    const respuesta = await fetch(`${RAIZ}${usuario}.json`);
    if (!respuesta.ok) {
      throw new ErrorApi({
        codigo: 'DEMO_SIN_DATOS',
        mensaje: `No se encontraron los datos de demostracion de ${usuario}.`,
        estado: 404,
      });
    }
    paquetes.set(usuario, await respuesta.json());
  }
  return paquetes.get(usuario);
}

function usuarioDeLaSesion() {
  const token = almacenTokens.acceso ?? '';
  return token.startsWith(PREFIJO) ? token.slice(PREFIJO.length) : null;
}

const soloRuta = (ruta) => ruta.split('?')[0];

function rechazarEscritura(metodo, ruta) {
  throw new ErrorApi({
    codigo: 'MODO_DEMOSTRACION',
    mensaje: 'Esta copia publicada es de solo lectura. Las reglas de negocio de este '
      + 'sistema viven en la base de datos, y aqui no hay motor que las garantice. '
      + 'Para operar el sistema completo, ejecutelo localmente con los tres comandos '
      + 'del archivo README.',
    detalle: [{ campo: 'operacion', mensaje: `${metodo} ${soloRuta(ruta)}` }],
    estado: 403,
  });
}

/** Sustituye a `ejecutar` del cliente HTTP cuando el sitio corre en modo demostracion. */
export async function ejecutarDemo(ruta, opciones = {}) {
  const metodo = (opciones.method ?? 'GET').toUpperCase();

  if (ruta === '/auth/login') {
    const { usuario, password } = opciones.body ?? {};
    const paquete = await paqueteDe(usuario).catch(() => null);
    if (!paquete || password !== PASSWORD) {
      throw new ErrorApi({
        codigo: 'CREDENCIALES_INVALIDAS',
        mensaje: 'Usuario o contrasena incorrectos. En la demostracion son las cinco '
          + 'cuentas de ejemplo con la contrasena Transmetro2026*.',
        estado: 401,
      });
    }
    const token = PREFIJO + usuario;
    return { ok: true, datos: { accessToken: token, refreshToken: token, usuario: paquete.usuario } };
  }

  if (ruta === '/auth/logout') return { ok: true };

  if (ruta === '/auth/refresh') {
    const usuario = usuarioDeLaSesion();
    const token = PREFIJO + usuario;
    return { ok: true, datos: { accessToken: token, refreshToken: token } };
  }

  if (metodo !== 'GET') rechazarEscritura(metodo, ruta);

  const usuario = usuarioDeLaSesion();
  if (!usuario) {
    throw new ErrorApi({ codigo: 'NO_AUTENTICADO', mensaje: 'Inicie sesion.', estado: 401 });
  }

  const { respuestas } = await paqueteDe(usuario);

  // Primero la ruta con sus filtros tal cual; si esa combinacion no se capturo,
  // sirve la misma ruta sin filtrar antes que dejar la pantalla en error.
  const cuerpo = respuestas[ruta] ?? respuestas[soloRuta(ruta)];
  if (cuerpo !== undefined) return cuerpo;

  // Una consulta que esta cuenta no tenia permitida, o un detalle que no se
  // capturo: se responde vacio, con la forma que esperan las pantallas.
  return { ok: true, datos: [], items: [], total: 0 };
}

export const MODO_DEMOSTRACION = import.meta.env.VITE_MODO_DEMO === 'true';
