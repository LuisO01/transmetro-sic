import { ApiError } from '../utils/errores.js';
import { nivelSuficiente, ROLES } from '../config/permisos.js';

/**
 * Exige un nivel minimo sobre un modulo, segun la matriz de permisos (RF-15).
 *
 *   router.post('/', requiereNivel(MODULOS.FLOTA, 'E'), controlador)
 *
 * @param {string} modulo   codigo de modulo (ver config/permisos.js)
 * @param {'L'|'E'|'A'} nivel nivel minimo exigido
 */
export function requiereNivel(modulo, nivel) {
  return (req, _res, next) => {
    const nivelUsuario = req.usuario?.permisos?.[modulo];

    if (!nivelSuficiente(nivelUsuario, nivel)) {
      return next(
        ApiError.prohibido(
          `Se requiere nivel ${nivel} sobre el modulo ${modulo}. `
          + `Su nivel actual es ${nivelUsuario ?? 'sin acceso'}.`,
        ),
      );
    }
    return next();
  };
}

/** Exige pertenecer a alguno de los roles indicados. */
export function requiereRol(...roles) {
  return (req, _res, next) => {
    const tiene = req.usuario?.roles?.some((r) => roles.includes(r));
    if (!tiene) {
      return next(ApiError.prohibido(`Accion restringida a los roles: ${roles.join(', ')}.`));
    }
    return next();
  };
}

/**
 * Calcula el ambito de datos del usuario y lo deja en `req.ambito`, para que
 * los servicios filtren por municipalidad o estacion sin repetir la logica.
 *
 *   global    -> ve todo
 *   municipal -> solo su municipalidad
 *   estacion  -> solo su estacion
 *   propio    -> solo sus propios registros
 */
export function resolverAmbito(req, _res, next) {
  const u = req.usuario;
  req.ambito = {
    tipo: u.ambito,
    municipalidadId: u.ambito === 'global' ? null : u.municipalidadId,
    estacionId: u.ambito === 'estacion' ? u.estacionId : null,
    personaId: u.ambito === 'propio' ? u.personaId : null,
    esAdminGeneral: u.roles.includes(ROLES.ADMIN_GENERAL),
  };
  return next();
}

/**
 * Verifica que el usuario pueda escribir sobre datos de `municipalidadId`.
 * El administrador general escribe sobre cualquier municipalidad; el municipal
 * solo sobre la suya.
 */
export function verificarAmbitoMunicipal(req, municipalidadId) {
  if (req.ambito?.esAdminGeneral || req.ambito?.tipo === 'global') return;
  if (municipalidadId == null) return;
  if (Number(municipalidadId) !== Number(req.usuario.municipalidadId)) {
    throw ApiError.prohibido('Solo puede operar sobre registros de su propia municipalidad.');
  }
}
