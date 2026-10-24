/**
 * Catalogo de modulos protegidos y jerarquia de niveles de acceso.
 * Debe mantenerse sincronizado con las tablas `modulo` y `rol_permiso`
 * (ver 01_database/11_seed.sql).
 */

export const MODULOS = Object.freeze({
  LINEAS_ESTACIONES: 'LINEAS_ESTACIONES',
  FLOTA: 'FLOTA',
  PERSONAL: 'PERSONAL',
  MONITOREO: 'MONITOREO',
  TECNICA: 'TECNICA',
  PAGOS: 'PAGOS',
  REPORTERIA: 'REPORTERIA',
  SEGURIDAD: 'SEGURIDAD',
});

export const ROLES = Object.freeze({
  OPERADOR_ESTACION: 'OPERADOR_ESTACION',
  PILOTO: 'PILOTO',
  GUARDIA: 'GUARDIA',
  ADMIN_MUNICIPAL: 'ADMIN_MUNICIPAL',
  ADMIN_GENERAL: 'ADMIN_GENERAL',
});

/** L = lectura, E = escritura en su ambito, A = administracion total. */
export const NIVELES = Object.freeze({ L: 1, E: 2, A: 3 });

/**
 * Determina si el nivel que posee el usuario alcanza el nivel exigido.
 * @param {'L'|'E'|'A'|undefined} nivelUsuario
 * @param {'L'|'E'|'A'} nivelRequerido
 */
export function nivelSuficiente(nivelUsuario, nivelRequerido) {
  if (!nivelUsuario) return false;
  return (NIVELES[nivelUsuario] ?? 0) >= (NIVELES[nivelRequerido] ?? 99);
}

/**
 * Ambito de datos que alcanza cada rol. El de mayor alcance gana cuando el
 * usuario tiene varios roles.
 */
export const AMBITOS = Object.freeze({ propio: 1, estacion: 2, municipal: 3, global: 4 });

export function ambitoMasAmplio(ambitos = []) {
  return ambitos.reduce(
    (mayor, actual) => ((AMBITOS[actual] ?? 0) > (AMBITOS[mayor] ?? 0) ? actual : mayor),
    'propio',
  );
}
