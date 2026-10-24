import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errores.js';

/**
 * Verifica el access token y deja en `req.usuario` la identidad y los permisos
 * efectivos que se calcularon al iniciar sesion (vista v_permisos_usuario).
 */
export function autenticar(req, _res, next) {
  const cabecera = req.headers.authorization ?? '';
  const [esquema, token] = cabecera.split(' ');

  if (esquema !== 'Bearer' || !token) {
    return next(ApiError.noAutorizado('Falta el token de acceso.'));
  }

  try {
    const carga = jwt.verify(token, env.auth.jwtSecret);
    req.usuario = {
      id: carga.sub,
      username: carga.username,
      nombreCompleto: carga.nombre,
      roles: carga.roles ?? [],
      permisos: carga.permisos ?? {},
      ambito: carga.ambito ?? 'propio',
      municipalidadId: carga.municipalidadId ?? null,
      estacionId: carga.estacionId ?? null,
      personaId: carga.personaId ?? null,
    };
    return next();
  } catch (error) {
    const mensaje = error.name === 'TokenExpiredError'
      ? 'La sesion expiro. Vuelva a iniciar sesion.'
      : 'Token de acceso invalido.';
    return next(ApiError.noAutorizado(mensaje));
  }
}
