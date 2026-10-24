import { pool, enTransaccion } from '../../db/pool.js';
import { ApiError } from '../../utils/errores.js';

// ---------------------------------------------------------------------------
// RF-07  Expediente de pilotos
// ---------------------------------------------------------------------------

export async function listarPilotos({ municipalidadId, texto, estado }) {
  const condiciones = [];
  const valores = [];

  if (municipalidadId) {
    valores.push(municipalidadId);
    condiciones.push(`per.municipalidad_id = $${valores.length}`);
  }
  if (estado) {
    valores.push(estado);
    condiciones.push(`p.estado = $${valores.length}`);
  }
  if (texto) {
    valores.push(`%${texto}%`);
    condiciones.push(`(per.nombres ILIKE $${valores.length} OR per.apellidos ILIKE $${valores.length}
                       OR p.codigo_piloto ILIKE $${valores.length} OR per.dpi ILIKE $${valores.length})`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT p.persona_id, p.codigo_piloto, p.numero_licencia, p.tipo_licencia,
            p.vigencia_licencia, p.fecha_ingreso, p.estado,
            per.nombres, per.apellidos, per.dpi, per.telefono, per.correo,
            per.municipio_residencia, m.nombre AS municipalidad,
            (p.vigencia_licencia < CURRENT_DATE)                       AS licencia_vencida,
            (p.vigencia_licencia BETWEEN CURRENT_DATE AND CURRENT_DATE + 60) AS licencia_por_vencer,
            (SELECT count(*) FROM piloto_educacion pe WHERE pe.piloto_id = p.persona_id)::int AS estudios,
            (SELECT count(*) FROM viaje v WHERE v.piloto_id = p.persona_id)::int AS viajes
       FROM piloto p
       JOIN persona per ON per.id = p.persona_id
       LEFT JOIN municipalidad m ON m.id = per.municipalidad_id
       ${where}
      ORDER BY per.apellidos, per.nombres`,
    valores,
  );
  return rows;
}

export async function expedientePiloto(pilotoId) {
  const { rows } = await pool.query(
    `SELECT p.persona_id, p.codigo_piloto, p.numero_licencia, p.tipo_licencia,
            p.vigencia_licencia, p.fecha_ingreso, p.estado, p.observaciones,
            per.nombres, per.apellidos, per.dpi, per.fecha_nacimiento,
            per.telefono, per.telefono_emergencia, per.correo,
            per.direccion_residencia, per.municipio_residencia,
            m.nombre AS municipalidad,
            (p.vigencia_licencia < CURRENT_DATE) AS licencia_vencida
       FROM piloto p
       JOIN persona per ON per.id = p.persona_id
       LEFT JOIN municipalidad m ON m.id = per.municipalidad_id
      WHERE p.persona_id = $1`,
    [pilotoId],
  );
  if (rows.length === 0) throw ApiError.noEncontrado('Piloto');

  const { rows: educacion } = await pool.query(
    `SELECT id, nivel, institucion, titulo_obtenido, anio_inicio, anio_fin
       FROM piloto_educacion WHERE piloto_id = $1
      ORDER BY anio_fin DESC NULLS LAST, anio_inicio DESC`,
    [pilotoId],
  );

  const { rows: viajes } = await pool.query(
    `SELECT v.id, v.fecha_hora_llegada, v.fecha_hora_salida, v.estado,
            b.numero_economico, l.codigo AS linea_codigo, e.nombre AS estacion
       FROM viaje v
       JOIN bus b ON b.id = v.bus_id
       JOIN linea l ON l.id = v.linea_id
       JOIN estacion e ON e.id = v.estacion_origen_id
      WHERE v.piloto_id = $1
      ORDER BY v.fecha_hora_llegada DESC LIMIT 10`,
    [pilotoId],
  );

  return { ...rows[0], educacion, viajes };
}

export async function agregarEstudio(pilotoId, datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `INSERT INTO piloto_educacion
           (piloto_id, nivel, institucion, titulo_obtenido, anio_inicio, anio_fin)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [pilotoId, datos.nivel, datos.institucion, datos.tituloObtenido ?? null,
        datos.anioInicio ?? null, datos.anioFin ?? null],
    );
    return rows[0];
  });
}

export async function actualizarPiloto(pilotoId, datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `UPDATE piloto
          SET numero_licencia   = COALESCE($2, numero_licencia),
              tipo_licencia     = COALESCE($3::tipo_licencia, tipo_licencia),
              vigencia_licencia = COALESCE($4::date, vigencia_licencia),
              estado            = COALESCE($5::estado_personal, estado),
              observaciones     = COALESCE($6, observaciones)
        WHERE persona_id = $1
        RETURNING *`,
      [pilotoId, datos.numeroLicencia ?? null, datos.tipoLicencia ?? null,
        datos.vigenciaLicencia ?? null, datos.estado ?? null, datos.observaciones ?? null],
    );
    if (rows.length === 0) throw ApiError.noEncontrado('Piloto');
    return rows[0];
  });
}

// ---------------------------------------------------------------------------
// RF-08  Guardias y cobertura por acceso
// ---------------------------------------------------------------------------

export async function listarGuardias({ municipalidadId, texto }) {
  const condiciones = [];
  const valores = [];
  if (municipalidadId) {
    valores.push(municipalidadId);
    condiciones.push(`per.municipalidad_id = $${valores.length}`);
  }
  if (texto) {
    valores.push(`%${texto}%`);
    condiciones.push(`(per.nombres ILIKE $${valores.length} OR per.apellidos ILIKE $${valores.length}
                       OR g.codigo_guardia ILIKE $${valores.length})`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT g.persona_id, g.codigo_guardia, g.empresa_seguridad, g.numero_credencial,
            g.fecha_ingreso, g.estado,
            per.nombres, per.apellidos, per.telefono, m.nombre AS municipalidad,
            (SELECT count(*) FROM guardia_asignacion ga
              WHERE ga.guardia_id = g.persona_id AND ga.fecha >= CURRENT_DATE)::int AS turnos_programados
       FROM guardia g
       JOIN persona per ON per.id = g.persona_id
       LEFT JOIN municipalidad m ON m.id = per.municipalidad_id
       ${where}
      ORDER BY per.apellidos, per.nombres`,
    valores,
  );
  return rows;
}

export async function turnos() {
  const { rows } = await pool.query(
    'SELECT id, codigo, nombre, hora_inicio, hora_fin, cruza_medianoche FROM turno WHERE activo ORDER BY hora_inicio',
  );
  return rows;
}

/** RF-08: cobertura por acceso y turno en la ventana de siete dias. */
export async function cobertura({ estacionId, accesoId, soloIncumplidos }) {
  const condiciones = [];
  const valores = [];
  if (estacionId) {
    valores.push(estacionId);
    condiciones.push(`estacion_id = $${valores.length}`);
  }
  if (accesoId) {
    valores.push(accesoId);
    condiciones.push(`acceso_id = $${valores.length}`);
  }
  if (soloIncumplidos) condiciones.push('NOT cumple');

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM v_cobertura_guardias ${where}
      ORDER BY fecha, estacion, acceso, turno LIMIT 300`,
    valores,
  );
  return rows;
}

/** Turnos propios del guardia que consulta (ambito propio). */
export async function miCobertura(guardiaId) {
  const { rows } = await pool.query(
    `SELECT ga.id, ga.fecha, ga.estado, t.codigo AS turno, t.nombre AS turno_nombre,
            t.hora_inicio, t.hora_fin,
            a.nombre AS acceso, a.guardias_minimos,
            e.nombre AS estacion, e.codigo AS estacion_codigo
       FROM guardia_asignacion ga
       JOIN turno t    ON t.id = ga.turno_id
       JOIN acceso a   ON a.id = ga.acceso_id
       JOIN estacion e ON e.id = a.estacion_id
      WHERE ga.guardia_id = $1 AND ga.fecha >= CURRENT_DATE - 7
      ORDER BY ga.fecha DESC, t.hora_inicio`,
    [guardiaId],
  );
  return rows;
}

export async function programarCobertura(datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `INSERT INTO guardia_asignacion (guardia_id, acceso_id, turno_id, fecha, estado, observacion)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [datos.guardiaId, datos.accesoId, datos.turnoId, datos.fecha,
        datos.estado ?? 'programado', datos.observacion ?? null],
    );
    return rows[0];
  });
}

/** El guardia marca su presencia; el administrador puede corregir el estado. */
export async function actualizarCobertura(id, datos, usuarioId, guardiaId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `UPDATE guardia_asignacion
          SET estado      = $2::estado_cobertura,
              observacion = COALESCE($3, observacion)
        WHERE id = $1
          AND ($4::bigint IS NULL OR guardia_id = $4)
        RETURNING *`,
      [id, datos.estado, datos.observacion ?? null, guardiaId ?? null],
    );
    if (rows.length === 0) {
      throw ApiError.noEncontrado('Asignacion de cobertura');
    }
    return rows[0];
  });
}

export async function eliminarCobertura(id, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      'DELETE FROM guardia_asignacion WHERE id = $1 RETURNING id, acceso_id, fecha',
      [id],
    );
    if (rows.length === 0) throw ApiError.noEncontrado('Asignacion de cobertura');
    return rows[0];
  });
}

/** Resumen para el encabezado del modulo. */
export async function resumen({ municipalidadId }) {
  const { rows } = await pool.query(
    `SELECT
       (SELECT count(*) FROM piloto p JOIN persona per ON per.id = p.persona_id
         WHERE p.estado = 'activo' AND ($1::bigint IS NULL OR per.municipalidad_id = $1))::int AS pilotos_activos,
       (SELECT count(*) FROM piloto p JOIN persona per ON per.id = p.persona_id
         WHERE p.vigencia_licencia < CURRENT_DATE + 60
           AND ($1::bigint IS NULL OR per.municipalidad_id = $1))::int AS licencias_por_vencer,
       (SELECT count(*) FROM guardia g JOIN persona per ON per.id = g.persona_id
         WHERE g.estado = 'activo' AND ($1::bigint IS NULL OR per.municipalidad_id = $1))::int AS guardias_activos,
       (SELECT count(*) FROM v_cobertura_guardias WHERE NOT cumple AND fecha = CURRENT_DATE)::int AS turnos_descubiertos_hoy`,
    [municipalidadId ?? null],
  );
  return rows[0];
}
