import { pool, enTransaccion } from '../../db/pool.js';
import { ApiError } from '../../utils/errores.js';

/** RF-06: predios con su ocupacion actual. */
export async function listarPredios({ municipalidadId }) {
  const valores = [];
  let where = '';
  if (municipalidadId) {
    valores.push(municipalidadId);
    where = 'WHERE pp.municipalidad_id = $1';
  }

  const { rows } = await pool.query(
    `SELECT pp.id, pp.codigo, pp.nombre, pp.direccion, pp.capacidad, pp.activo,
            pp.municipalidad_id, o.municipalidad,
            COALESCE(o.espacios_totales, 0)  AS espacios_totales,
            COALESCE(o.espacios_ocupados, 0) AS espacios_ocupados,
            COALESCE(o.espacios_libres, 0)   AS espacios_libres
       FROM parqueo_predio pp
       LEFT JOIN v_ocupacion_parqueos o ON o.predio_id = pp.id
       ${where}
      ORDER BY pp.codigo`,
    valores,
  );
  return rows;
}

export async function crearPredio(datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `INSERT INTO parqueo_predio (codigo, nombre, municipalidad_id, direccion, capacidad)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [datos.codigo, datos.nombre, datos.municipalidadId, datos.direccion ?? null, datos.capacidad],
    );
    return rows[0];
  });
}

export async function listarEspacios(predioId, { soloDisponibles }) {
  const { rows } = await pool.query(
    `SELECT pe.id, pe.codigo, pe.tipo_permitido, pe.estado,
            pa.bus_id, b.numero_economico, b.placa, pa.fecha_inicio AS ocupado_desde
       FROM parqueo_espacio pe
       LEFT JOIN parqueo_asignacion pa ON pa.espacio_id = pe.id AND pa.fecha_fin IS NULL
       LEFT JOIN bus b ON b.id = pa.bus_id
      WHERE pe.predio_id = $1
        AND ($2::boolean IS NOT TRUE OR (pa.id IS NULL AND pe.estado = 'disponible'))
      ORDER BY pe.codigo`,
    [predioId, soloDisponibles ?? false],
  );
  return rows;
}

export async function crearEspacios(predioId, datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `INSERT INTO parqueo_espacio (predio_id, codigo, tipo_permitido, estado)
       SELECT $1, c, $3, 'disponible'
         FROM unnest($2::text[]) AS c
       RETURNING *`,
      [predioId, datos.codigos, datos.tipoPermitido ?? null],
    );
    return rows;
  });
}

/**
 * RF-06: asigna un espacio a la unidad. Las restricciones EXCLUDE de la base
 * impiden que un espacio aloje dos buses o que un bus ocupe dos espacios.
 */
export async function asignarBus(busId, datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows: espacio } = await cliente.query(
      `SELECT pe.id, pe.codigo, pe.estado, pe.tipo_permitido, pp.nombre AS predio
         FROM parqueo_espacio pe
         JOIN parqueo_predio pp ON pp.id = pe.predio_id
        WHERE pe.id = $1
        FOR UPDATE OF pe`,
      [datos.espacioId],
    );
    if (espacio.length === 0) throw ApiError.noEncontrado('Espacio de parqueo');
    if (espacio[0].estado === 'inhabilitado') {
      throw ApiError.invalido(`El espacio ${espacio[0].codigo} esta inhabilitado.`);
    }

    const { rows: vigente } = await cliente.query(
      `SELECT pa.id, pe.codigo
         FROM parqueo_asignacion pa
         JOIN parqueo_espacio pe ON pe.id = pa.espacio_id
        WHERE pa.bus_id = $1 AND pa.fecha_fin IS NULL`,
      [busId],
    );

    if (vigente.length > 0) {
      if (!datos.liberarVigente) {
        throw ApiError.conflicto(
          'BUS_YA_PARQUEADO',
          `La unidad ya ocupa el espacio ${vigente[0].codigo}. `
          + 'Envie "liberarVigente": true para trasladarla (RF-06).',
          { asignacionVigenteId: vigente[0].id },
        );
      }
      await cliente.query('UPDATE parqueo_asignacion SET fecha_fin = now() WHERE id = $1', [vigente[0].id]);
    }

    const { rows } = await cliente.query(
      `INSERT INTO parqueo_asignacion (espacio_id, bus_id, fecha_inicio, motivo)
       VALUES ($1, $2, COALESCE($3, now()), $4)
       RETURNING *`,
      [datos.espacioId, busId, datos.fechaInicio ?? null, datos.motivo ?? null],
    );

    await cliente.query(
      "UPDATE parqueo_espacio SET estado = 'ocupado' WHERE id = $1",
      [datos.espacioId],
    );

    return rows[0];
  });
}

export async function liberarBus(busId, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `UPDATE parqueo_asignacion
          SET fecha_fin = now()
        WHERE bus_id = $1 AND fecha_fin IS NULL
        RETURNING *`,
      [busId],
    );
    if (rows.length === 0) {
      throw ApiError.conflicto('SIN_PARQUEO_VIGENTE', 'La unidad no tiene un parqueo asignado.');
    }

    await cliente.query(
      "UPDATE parqueo_espacio SET estado = 'disponible' WHERE id = $1",
      [rows[0].espacio_id],
    );

    return rows[0];
  });
}

/** RF-06: excepciones — unidades operativas sin parqueo vigente. */
export async function unidadesSinParqueo({ municipalidadId }) {
  const valores = [];
  let where = '';
  if (municipalidadId) {
    valores.push(municipalidadId);
    where = `WHERE b.municipalidad_id = $1`;
  }

  const { rows } = await pool.query(
    `SELECT v.* FROM v_buses_sin_parqueo v
       JOIN bus b ON b.id = v.bus_id
       ${where}
      ORDER BY v.numero_economico`,
    valores,
  );
  return rows;
}
