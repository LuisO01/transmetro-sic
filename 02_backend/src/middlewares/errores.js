import { env } from '../config/env.js';
import { ApiError, traducirErrorPg } from '../utils/errores.js';

/** Ruta no encontrada. */
export function rutaNoEncontrada(req, _res, next) {
  next(new ApiError(404, 'RUTA_NO_ENCONTRADA', `No existe el recurso ${req.method} ${req.originalUrl}.`));
}

/**
 * Manejador central de errores. Devuelve siempre la misma forma de respuesta
 * y nunca filtra detalles internos en produccion.
 */
// eslint-disable-next-line no-unused-vars
export function manejadorErrores(error, req, res, _next) {
  const traducido = error instanceof ApiError ? error : traducirErrorPg(error);

  if (traducido) {
    return res.status(traducido.estado).json({
      ok: false,
      error: {
        codigo: traducido.codigo,
        mensaje: traducido.message,
        detalle: traducido.detalle,
      },
    });
  }

  console.error('[error]', {
    ruta: `${req.method} ${req.originalUrl}`,
    usuario: req.usuario?.username,
    mensaje: error.message,
    stack: error.stack,
  });

  return res.status(500).json({
    ok: false,
    error: {
      codigo: 'ERROR_INTERNO',
      mensaje: 'Ocurrio un error inesperado. Intente de nuevo o contacte al administrador.',
      ...(env.esProduccion ? {} : { detalle: error.message }),
    },
  });
}
