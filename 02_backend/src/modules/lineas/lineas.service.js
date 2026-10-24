import { pool, enTransaccion } from '../../db/pool.js';
import { ApiError } from '../../utils/errores.js';

/**
 * RF-01 / RF-02 / RF-05
 * Listado de lineas con su longitud derivada y la situacion de su flota.
 */
export async function listar({ municipalidadId, estado, texto, limite, desplazamiento }) {
  const condiciones = [];
  const valores = [];

  if (municipalidadId) {
    valores.push(municipalidadId);
    condiciones.push(`l.municipalidad_id = $${valores.length}`);
  }
  if (estado) {
    valores.push(estado);
    condiciones.push(`l.estado = $${valores.length}`);
  }
  if (texto) {
    valores.push(`%${texto}%`);
    condiciones.push(`(l.nombre ILIKE $${valores.length} OR l.codigo ILIKE $${valores.length})`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  valores.push(limite, desplazamiento);

  const { rows } = await pool.query(
    `SELECT l.id, l.codigo, l.nombre, l.color_hex, l.tipo, l.estado,
            l.unidades_minimas, l.unidades_maximas, l.fecha_inicio_operacion,
            l.municipalidad_id, m.nombre AS municipalidad,
            COALESCE(u.unidades_operativas, 0) AS unidades_operativas,
            u.situacion,
            COALESCE(li.longitud_km, 0)        AS longitud_km_ida,
            COALESCE(li.total_estaciones, 0)   AS total_estaciones,
            count(*) OVER ()                   AS total_registros
       FROM linea l
       JOIN municipalidad m        ON m.id = l.municipalidad_id
       LEFT JOIN v_unidades_por_linea u ON u.linea_id = l.id
       LEFT JOIN v_linea_longitud li    ON li.linea_id = l.id AND li.sentido = 'ida'
       ${where}
      ORDER BY l.codigo
      LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
    valores,
  );

  const total = rows.length ? Number(rows[0].total_registros) : 0;
  return { total, items: rows.map(({ total_registros: _t, ...fila }) => fila) };
}

export async function obtener(id) {
  const { rows } = await pool.query(
    `SELECT l.*, m.nombre AS municipalidad,
            u.unidades_operativas, u.situacion
       FROM linea l
       JOIN municipalidad m ON m.id = l.municipalidad_id
       LEFT JOIN v_unidades_por_linea u ON u.linea_id = l.id
      WHERE l.id = $1`,
    [id],
  );
  if (rows.length === 0) throw ApiError.noEncontrado('Linea');

  const { rows: longitudes } = await pool.query(
    'SELECT sentido, total_estaciones, longitud_km, tiempo_estimado_min FROM v_linea_longitud WHERE linea_id = $1',
    [id],
  );

  return { ...rows[0], longitudes };
}

export async function crear(datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `INSERT INTO linea (codigo, nombre, color_hex, tipo, municipalidad_id,
                          unidades_minimas, unidades_maximas, estado,
                          fecha_inicio_operacion, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        datos.codigo, datos.nombre, datos.colorHex, datos.tipo, datos.municipalidadId,
        datos.unidadesMinimas, datos.unidadesMaximas, datos.estado,
        datos.fechaInicioOperacion ?? null, datos.observaciones ?? null,
      ],
    );
    return rows[0];
  });
}

export async function actualizar(id, datos, usuarioId) {
  const mapa = {
    nombre: 'nombre',
    colorHex: 'color_hex',
    tipo: 'tipo',
    municipalidadId: 'municipalidad_id',
    unidadesMinimas: 'unidades_minimas',
    unidadesMaximas: 'unidades_maximas',
    estado: 'estado',
    fechaInicioOperacion: 'fecha_inicio_operacion',
    observaciones: 'observaciones',
  };

  const asignaciones = [];
  const valores = [id];

  for (const [clave, columna] of Object.entries(mapa)) {
    if (datos[clave] !== undefined) {
      valores.push(datos[clave]);
      asignaciones.push(`${columna} = $${valores.length}`);
    }
  }

  if (asignaciones.length === 0) {
    throw ApiError.invalido('No se envio ningun campo por actualizar.');
  }

  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `UPDATE linea SET ${asignaciones.join(', ')} WHERE id = $1 RETURNING *`,
      valores,
    );
    if (rows.length === 0) throw ApiError.noEncontrado('Linea');

    // Cambiar el rango o el estado puede abrir o cerrar la alerta de RF-05
    await cliente.query('SELECT fn_evaluar_rango_unidades($1)', [id]);
    return rows[0];
  });
}

/** Baja logica: nunca se borra fisicamente (trazabilidad de auditoria). */
export async function darDeBaja(id, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows: vigentes } = await cliente.query(
      'SELECT count(*)::int AS total FROM bus_linea_asignacion WHERE linea_id = $1 AND fecha_fin IS NULL',
      [id],
    );
    if (vigentes[0].total > 0) {
      throw ApiError.conflicto(
        'LINEA_CON_UNIDADES',
        `No se puede dar de baja la linea: tiene ${vigentes[0].total} unidad(es) asignada(s). `
        + 'Finalice primero las asignaciones.',
      );
    }

    const { rows } = await cliente.query(
      "UPDATE linea SET estado = 'baja' WHERE id = $1 RETURNING id, codigo, estado",
      [id],
    );
    if (rows.length === 0) throw ApiError.noEncontrado('Linea');
    return rows[0];
  });
}

// ---------------------------------------------------------------------------
// RF-01 / RF-02: recorrido (relacion muchos a muchos con orden y distancia)
// ---------------------------------------------------------------------------

export async function obtenerRecorrido(lineaId, sentido = 'ida') {
  const { rows: linea } = await pool.query('SELECT id, codigo, nombre FROM linea WHERE id = $1', [lineaId]);
  if (linea.length === 0) throw ApiError.noEncontrado('Linea');

  const { rows } = await pool.query(
    `SELECT le.id AS linea_estacion_id, r.orden_recorrido, r.estacion_id,
            r.estacion_codigo, r.estacion_nombre, r.estacion_tipo, r.municipalidad,
            r.distancia_km_siguiente, r.tiempo_estimado_min, r.estacion_siguiente
       FROM v_linea_recorrido r
       JOIN linea_estacion le
         ON le.linea_id = r.linea_id
        AND le.estacion_id = r.estacion_id
        AND le.sentido = r.sentido
      WHERE r.linea_id = $1 AND r.sentido = $2
      ORDER BY r.orden_recorrido`,
    [lineaId, sentido],
  );

  const longitudKm = rows.reduce((suma, e) => suma + Number(e.distancia_km_siguiente ?? 0), 0);
  const tiempoMin = rows.reduce((suma, e) => suma + Number(e.tiempo_estimado_min ?? 0), 0);

  return {
    linea: linea[0],
    sentido,
    totalEstaciones: rows.length,
    longitudKm: Number(longitudKm.toFixed(3)),
    tiempoEstimadoMin: tiempoMin,
    estaciones: rows,
  };
}

export async function agregarEstacionAlRecorrido(lineaId, datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `INSERT INTO linea_estacion
           (linea_id, estacion_id, sentido, orden_recorrido, distancia_km_siguiente, tiempo_estimado_min)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        lineaId, datos.estacionId, datos.sentido, datos.ordenRecorrido,
        datos.distanciaKmSiguiente ?? null, datos.tiempoEstimadoMin ?? null,
      ],
    );
    return rows[0];
  });
}

export async function actualizarTramo(lineaEstacionId, datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `UPDATE linea_estacion
          SET orden_recorrido        = COALESCE($2, orden_recorrido),
              distancia_km_siguiente = COALESCE($3, distancia_km_siguiente),
              tiempo_estimado_min    = COALESCE($4, tiempo_estimado_min),
              activo                 = COALESCE($5, activo)
        WHERE id = $1
        RETURNING *`,
      [
        lineaEstacionId, datos.ordenRecorrido ?? null, datos.distanciaKmSiguiente ?? null,
        datos.tiempoEstimadoMin ?? null, datos.activo ?? null,
      ],
    );
    if (rows.length === 0) throw ApiError.noEncontrado('Tramo del recorrido');
    return rows[0];
  });
}

export async function quitarEstacionDelRecorrido(lineaEstacionId, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      'DELETE FROM linea_estacion WHERE id = $1 RETURNING id, linea_id, estacion_id, sentido',
      [lineaEstacionId],
    );
    if (rows.length === 0) throw ApiError.noEncontrado('Tramo del recorrido');
    return rows[0];
  });
}

/** RF-04 / RF-05: unidades asignadas a la linea y evaluacion del rango. */
export async function obtenerUnidades(lineaId) {
  const { rows: resumen } = await pool.query(
    'SELECT * FROM v_unidades_por_linea WHERE linea_id = $1',
    [lineaId],
  );
  if (resumen.length === 0) throw ApiError.noEncontrado('Linea');

  const { rows: unidades } = await pool.query(
    `SELECT b.id, b.numero_economico, b.placa, b.tipo, b.estado, b.capacidad_total,
            bla.id AS asignacion_id, bla.fecha_inicio
       FROM bus_linea_asignacion bla
       JOIN bus b ON b.id = bla.bus_id
      WHERE bla.linea_id = $1 AND bla.fecha_fin IS NULL
      ORDER BY b.numero_economico`,
    [lineaId],
  );

  return { ...resumen[0], unidades };
}
