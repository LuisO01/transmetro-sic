/**
 * Cliente HTTP unico de la aplicacion.
 *
 * - Adjunta el access token a cada peticion.
 * - Si la API responde 401 por token vencido, intenta refrescar una sola vez
 *   y reintenta la peticion original.
 * - Normaliza los errores al formato { codigo, mensaje, detalle } que devuelve
 *   el backend, para que las pantallas muestren siempre el mismo tipo de objeto.
 */

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';
const CLAVE_ACCESO = 'transmetro.accessToken';
const CLAVE_REFRESH = 'transmetro.refreshToken';

export const almacenTokens = {
  get acceso() {
    return localStorage.getItem(CLAVE_ACCESO);
  },
  get refresco() {
    return localStorage.getItem(CLAVE_REFRESH);
  },
  guardar({ accessToken, refreshToken }) {
    if (accessToken) localStorage.setItem(CLAVE_ACCESO, accessToken);
    if (refreshToken) localStorage.setItem(CLAVE_REFRESH, refreshToken);
  },
  limpiar() {
    localStorage.removeItem(CLAVE_ACCESO);
    localStorage.removeItem(CLAVE_REFRESH);
  },
};

export class ErrorApi extends Error {
  constructor({ codigo, mensaje, detalle, estado }) {
    super(mensaje ?? 'Error de comunicacion con el servidor.');
    this.name = 'ErrorApi';
    this.codigo = codigo ?? 'ERROR_RED';
    this.detalle = detalle;
    this.estado = estado;
  }
}

let refrescoEnCurso = null;

async function refrescarSesion() {
  // Un solo refresco simultaneo aunque varias peticiones fallen a la vez
  if (!refrescoEnCurso) {
    refrescoEnCurso = (async () => {
      const refreshToken = almacenTokens.refresco;
      if (!refreshToken) throw new ErrorApi({ codigo: 'SIN_SESION', mensaje: 'Sesion no iniciada.' });

      const respuesta = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!respuesta.ok) {
        almacenTokens.limpiar();
        throw new ErrorApi({ codigo: 'SESION_EXPIRADA', mensaje: 'La sesion expiro.', estado: 401 });
      }

      const { datos } = await respuesta.json();
      almacenTokens.guardar(datos);
      return datos.accessToken;
    })().finally(() => {
      refrescoEnCurso = null;
    });
  }
  return refrescoEnCurso;
}

async function ejecutar(ruta, opciones = {}, reintentar = true) {
  const cabeceras = { ...(opciones.headers ?? {}) };
  if (opciones.body !== undefined) cabeceras['Content-Type'] = 'application/json';

  const token = almacenTokens.acceso;
  if (token) cabeceras.Authorization = `Bearer ${token}`;

  let respuesta;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      ...opciones,
      headers: cabeceras,
      body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
    });
  } catch {
    throw new ErrorApi({
      codigo: 'ERROR_RED',
      mensaje: 'No se pudo contactar al servidor. Revise su conexion.',
    });
  }

  if (respuesta.status === 401 && reintentar && almacenTokens.refresco) {
    await refrescarSesion();
    return ejecutar(ruta, opciones, false);
  }

  if (respuesta.status === 204) return null;

  const cuerpo = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    throw new ErrorApi({ ...(cuerpo?.error ?? {}), estado: respuesta.status });
  }

  return cuerpo;
}

const conQuery = (ruta, params) => {
  if (!params) return ruta;
  const limpio = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
  const cadena = new URLSearchParams(limpio).toString();
  return cadena ? `${ruta}?${cadena}` : ruta;
};

export const api = {
  get: (ruta, params) => ejecutar(conQuery(ruta, params)),
  post: (ruta, body) => ejecutar(ruta, { method: 'POST', body }),
  patch: (ruta, body) => ejecutar(ruta, { method: 'PATCH', body }),
  put: (ruta, body) => ejecutar(ruta, { method: 'PUT', body }),
  del: (ruta, body) => ejecutar(ruta, { method: 'DELETE', body }),
};
