import { ApiError } from '../utils/errores.js';

/**
 * Valida `body`, `params` o `query` con un esquema de zod y reemplaza el
 * contenido por el valor ya parseado (con tipos convertidos).
 *
 *   router.post('/', validar({ body: crearLineaSchema }), controlador)
 *
 * @param {{body?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny}} esquemas
 */
export function validar(esquemas) {
  return (req, _res, next) => {
    for (const parte of ['body', 'params', 'query']) {
      const esquema = esquemas[parte];
      if (!esquema) continue;

      const resultado = esquema.safeParse(req[parte]);
      if (!resultado.success) {
        const detalle = resultado.error.issues.map((i) => ({
          campo: i.path.join('.'),
          mensaje: i.message,
        }));
        return next(new ApiError(400, 'VALIDACION', 'Los datos enviados no son validos.', detalle));
      }
      // req.query es de solo lectura en Express 5; se asigna con defineProperty
      Object.defineProperty(req, parte, { value: resultado.data, writable: true });
    }
    return next();
  };
}
