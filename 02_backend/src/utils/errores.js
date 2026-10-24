/**
 * Errores de aplicacion y traduccion de los codigos de PostgreSQL a respuestas
 * HTTP con mensajes que el usuario final pueda entender.
 */

export class ApiError extends Error {
  /**
   * @param {number} estado  codigo HTTP
   * @param {string} codigo  codigo de negocio, p. ej. 'BUS_YA_ASIGNADO'
   * @param {string} mensaje mensaje para el usuario
   * @param {object} [detalle]
   */
  constructor(estado, codigo, mensaje, detalle) {
    super(mensaje);
    this.name = 'ApiError';
    this.estado = estado;
    this.codigo = codigo;
    this.detalle = detalle;
  }

  static noEncontrado(recurso = 'Recurso') {
    return new ApiError(404, 'NO_ENCONTRADO', `${recurso} no encontrado.`);
  }

  static noAutorizado(mensaje = 'Credenciales invalidas.') {
    return new ApiError(401, 'NO_AUTENTICADO', mensaje);
  }

  static prohibido(mensaje = 'No tiene permisos para realizar esta accion.') {
    return new ApiError(403, 'PROHIBIDO', mensaje);
  }

  static conflicto(codigo, mensaje, detalle) {
    return new ApiError(409, codigo, mensaje, detalle);
  }

  static invalido(mensaje, detalle) {
    return new ApiError(422, 'REGLA_NEGOCIO', mensaje, detalle);
  }
}

/**
 * Mapea restricciones de la base a mensajes de negocio. Las reglas viven en la
 * base (unica fuente de verdad); aqui solo se les da nombre de cara al usuario.
 */
const RESTRICCIONES = {
  ex_bus_una_linea_a_la_vez: [
    'BUS_YA_ASIGNADO',
    'La unidad ya tiene una asignacion vigente o traslapada con otra linea (RF-04). '
      + 'Debe finalizar la asignacion anterior antes de crear una nueva.',
  ],
  ux_bus_asignacion_vigente: [
    'BUS_YA_ASIGNADO',
    'La unidad ya esta asignada a una linea activa (RF-04).',
  ],
  ex_espacio_un_bus: [
    'ESPACIO_OCUPADO',
    'El espacio de parqueo ya esta ocupado en ese periodo (RF-06).',
  ],
  ex_bus_un_espacio: [
    'BUS_YA_PARQUEADO',
    'La unidad ya ocupa otro espacio de parqueo en ese periodo (RF-06).',
  ],
  ck_viaje_espera_minima: [
    'ESPERA_INCUMPLIDA',
    'Una unidad con menos del 25 % de ocupacion debe permanecer al menos 5 minutos en el anden (RF-10).',
  ],
  ck_linea_rango: [
    'RANGO_INVALIDO',
    'El maximo de unidades no puede ser menor que el minimo (RF-05).',
  ],
  uq_linea_estacion_orden: [
    'ORDEN_DUPLICADO',
    'Ya existe otra estacion con ese orden de recorrido en la linea y sentido indicados.',
  ],
  uq_linea_estacion_par: [
    'ESTACION_DUPLICADA',
    'La estacion ya forma parte del recorrido de esa linea en ese sentido.',
  ],
  uq_guardia_turno: [
    'GUARDIA_OCUPADO',
    'El guardia ya tiene asignado ese turno en otro acceso para la misma fecha (RF-08).',
  ],
  uq_bus_placa: ['PLACA_DUPLICADA', 'Ya existe una unidad registrada con esa placa.'],
  uq_bus_economico: ['ECONOMICO_DUPLICADO', 'Ya existe una unidad con ese numero economico.'],
  uq_linea_codigo: ['CODIGO_DUPLICADO', 'Ya existe una linea con ese codigo.'],
  uq_estacion_codigo: ['CODIGO_DUPLICADO', 'Ya existe una estacion con ese codigo.'],
  uq_acceso_codigo: ['CODIGO_DUPLICADO', 'La estacion ya tiene un acceso con ese codigo.'],
  uq_usuario_username: ['USUARIO_DUPLICADO', 'El nombre de usuario ya esta en uso.'],
  uq_usuario_correo: ['CORREO_DUPLICADO', 'El correo ya esta registrado.'],
  uq_transaccion_referencia: [
    'TRANSACCION_DUPLICADA',
    'La transaccion ya fue procesada (referencia externa repetida).',
  ],
};

/** @param {any} error */
export function traducirErrorPg(error) {
  if (!error?.code) return null;

  const nombre = error.constraint;
  if (nombre && RESTRICCIONES[nombre]) {
    const [codigo, mensaje] = RESTRICCIONES[nombre];
    const estado = error.code === '23514' ? 422 : 409;
    return new ApiError(estado, codigo, mensaje, { restriccion: nombre });
  }

  switch (error.code) {
    case '23505': // unique_violation
      return ApiError.conflicto('REGISTRO_DUPLICADO', 'Ya existe un registro con esos datos unicos.', {
        restriccion: nombre,
      });
    case '23503': // foreign_key_violation
      return ApiError.conflicto(
        'REFERENCIA_INVALIDA',
        'El registro referenciado no existe o esta siendo utilizado por otros registros.',
        { restriccion: nombre },
      );
    case '23514': // check_violation
      return ApiError.invalido('Los datos violan una regla de negocio de la base de datos.', {
        restriccion: nombre,
      });
    case '23P01': // exclusion_violation
      return ApiError.conflicto('PERIODO_TRASLAPADO', 'El periodo indicado se traslapa con otro registro vigente.', {
        restriccion: nombre,
      });
    case '22P02': // invalid_text_representation
      return new ApiError(400, 'DATO_INVALIDO', 'Alguno de los valores enviados tiene un formato invalido.');
    default:
      return null;
  }
}
