import { pool, enTransaccion } from '../../db/pool.js';
import { ApiError } from '../../utils/errores.js';

/** RF-04: listado de unidades con su linea vigente y su parqueo vigente. */
export async function listar({ municipalidadId, lineaId, estado, sinParqueo, texto, limite, desplazamiento }) {
  const condiciones = [];
  const valores = [];

  if (municipalidadId) {
    valores.push(municipalidadId);
    condiciones.push(`b.municipalidad_id = $${valores.length}`);
  }
  if (estado) {
    valores.push(estado);
    condiciones.push(`b.estado = $${valores.length}`);
  }
  if (lineaId) {
    valores.push(lineaId);
    condiciones.push(`bla.linea_id = $${valores.length}`);
  }
  if (texto) {
    valores.push(`%${texto}%`);
    condiciones.push(`(b.placa ILIKE $${valores.length} OR b.numero_economico ILIKE $${valores.length})`);
  }
  if (sinParqueo) {
    condiciones.push('pa.id IS NULL');
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  valores.push(limite, desplazamiento);

  const { rows } = await pool.query(
    `SELECT b.id, b.placa, b.numero_economico, b.tipo, b.marca, b.modelo, b.anio,
            b.capacidad_sentados, b.capacidad_pie, b.capacidad_total, b.estado,
            b.municipalidad_id, m.nombre AS municipalidad,
            bla.id AS asignacion_id, bla.linea_id, l.codigo AS linea_codigo,
            bla.fecha_inicio AS asignado_desde,
            pa.id AS parqueo_asignacion_id, pe.codigo AS espacio_codigo,
            pp.nombre AS predio,
            count(*) OVER () AS total_registros
       FROM bus b
       JOIN municipalidad m ON m.id = b.municipalidad_id
       LEFT JOIN bus_linea_asignacion bla ON bla.bus_id = b.id AND bla.fecha_fin IS NULL
       LEFT JOIN linea l                  ON l.id = bla.linea_id
       LEFT JOIN parqueo_asignacion pa    ON pa.bus_id = b.id AND pa.fecha_fin IS NULL
       LEFT JOIN parqueo_espacio pe       ON pe.id = pa.espacio_id
       LEFT JOIN parqueo_predio pp        ON pp.id = pe.predio_id
       ${where}
      ORDER BY b.numero_economico
      LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
    valores,
  );

  const total = rows.length ? Number(rows[0].total_registros) : 0;
  return { total, items: rows.map(({ total_registros: _t, ...fila }) => fila) };
}

export async function obtener(id) {
  const { rows } = await pool.query(
    `SELECT b.*, m.nombre AS municipalidad,
            bla.id AS asignacion_id, bla.linea_id, l.codigo AS linea_codigo,
            l.nombre AS linea_nombre, bla.fecha_inicio AS asignado_desde,
            pa.id AS parqueo_asignacion_id, pe.codigo AS espacio_codigo, pp.nombre AS predio
       FROM bus b
       JOIN municipalidad m ON m.id = b.municipalidad_id
       LEFT JOIN bus_linea_asignacion bla ON bla.bus_id = b.id AND bla.fecha_fin IS NULL
       LEFT JOIN linea l                  ON l.id = bla.linea_id
       LEFT JOIN parqueo_asignacion pa    ON pa.bus_id = b.id AND pa.fecha_fin IS NULL
       LEFT JOIN parqueo_espacio pe       ON pe.id = pa.espacio_id
       LEFT JOIN parqueo_predio pp        ON pp.id = pe.predio_id
      WHERE b.id = $1`,
    [id],
  );
  if (rows.length === 0) throw ApiError.noEncontrado('Unidad');
  return rows[0];
}

export async function crear(datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `INSERT INTO bus (placa, numero_economico, municipalidad_id, tipo, marca, modelo,
                        anio, capacidad_sentados, capacidad_pie, estado, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        datos.placa, datos.numeroEconomico, datos.municipalidadId, datos.tipo,
        datos.marca ?? null, datos.modelo ?? null, datos.anio ?? null,
        datos.capacidadSentados, datos.capacidadPie, datos.estado, datos.observaciones ?? null,
      ],
    );
    return rows[0];
  });
}

export async function actualizar(id, datos, usuarioId) {
  const mapa = {
    placa: 'placa',
    numeroEconomico: 'numero_economico',
    municipalidadId: 'municipalidad_id',
    tipo: 'tipo',
    marca: 'marca',
    modelo: 'modelo',
    anio: 'anio',
    capacidadSentados: 'capacidad_sentados',
    capacidadPie: 'capacidad_pie',
    estado: 'estado',
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

  if (asignaciones.length === 0) throw ApiError.invalido('No se envio ningun campo por actualizar.');

  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `UPDATE bus SET ${asignaciones.join(', ')} WHERE id = $1 RETURNING *`,
      valores,
    );
    if (rows.length === 0) throw ApiError.noEncontrado('Unidad');
    return rows[0];
  });
}

// ---------------------------------------------------------------------------
// RF-04: un bus solo puede estar activo en una linea a la vez
// ---------------------------------------------------------------------------

/**
 * Asigna la unidad a una linea. La base impide el traslape con la restriccion
 * EXCLUDE `ex_bus_una_linea_a_la_vez`; aqui se agrega la lectura previa para
 * devolver un mensaje util y, si el usuario lo pide expresamente, cerrar la
 * asignacion vigente en la misma transaccion.
 */
export async function asignarALinea(busId, datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    // FOR UPDATE evita una condicion de carrera entre dos asignaciones simultaneas
    const { rows: bus } = await cliente.query(
      'SELECT id, numero_economico, estado FROM bus WHERE id = $1 FOR UPDATE',
      [busId],
    );
    if (bus.length === 0) throw ApiError.noEncontrado('Unidad');

    if (bus[0].estado === 'baja') {
      throw ApiError.invalido('No se puede asignar una unidad dada de baja.');
    }

    const { rows: linea } = await cliente.query(
      'SELECT id, codigo, estado FROM linea WHERE id = $1',
      [datos.lineaId],
    );
    if (linea.length === 0) throw ApiError.noEncontrado('Linea');
    if (linea[0].estado === 'baja') {
      throw ApiError.invalido('No se puede asignar unidades a una linea dada de baja.');
    }

    const { rows: vigente } = await cliente.query(
      `SELECT bla.id, bla.linea_id, l.codigo
         FROM bus_linea_asignacion bla
         JOIN linea l ON l.id = bla.linea_id
        WHERE bla.bus_id = $1 AND bla.fecha_fin IS NULL`,
      [busId],
    );

    if (vigente.length > 0) {
      if (Number(vigente[0].linea_id) === Number(datos.lineaId)) {
        throw ApiError.conflicto(
          'ASIGNACION_SIN_CAMBIO',
          `La unidad ${bus[0].numero_economico} ya esta asignada a la linea ${vigente[0].codigo}.`,
        );
      }
      if (!datos.finalizarVigente) {
        throw ApiError.conflicto(
          'BUS_YA_ASIGNADO',
          `La unidad ${bus[0].numero_economico} esta asignada a la linea ${vigente[0].codigo}. `
          + 'Envie "finalizarVigente": true para reasignarla (RF-04).',
          { asignacionVigenteId: vigente[0].id, lineaActual: vigente[0].codigo },
        );
      }

      await cliente.query(
        'UPDATE bus_linea_asignacion SET fecha_fin = now(), finalizado_por = $2 WHERE id = $1',
        [vigente[0].id, usuarioId],
      );
    }

    const { rows } = await cliente.query(
      `INSERT INTO bus_linea_asignacion (bus_id, linea_id, fecha_inicio, motivo)
       VALUES ($1, $2, COALESCE($3, now()), $4)
       RETURNING *`,
      [busId, datos.lineaId, datos.fechaInicio ?? null, datos.motivo ?? null],
    );

    return rows[0];
  });
}

export async function finalizarAsignacion(busId, datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `UPDATE bus_linea_asignacion
          SET fecha_fin = now(),
              finalizado_por = $2,
              motivo = COALESCE($3, motivo)
        WHERE bus_id = $1 AND fecha_fin IS NULL
        RETURNING *`,
      [busId, usuarioId, datos?.motivo ?? null],
    );
    if (rows.length === 0) {
      throw ApiError.conflicto('SIN_ASIGNACION_VIGENTE', 'La unidad no tiene una asignacion vigente.');
    }
    return rows[0];
  });
}

export async function historialAsignaciones(busId) {
  const { rows } = await pool.query(
    `SELECT bla.id, bla.linea_id, l.codigo AS linea_codigo, l.nombre AS linea_nombre,
            bla.fecha_inicio, bla.fecha_fin, bla.motivo,
            uc.username AS creado_por, uf.username AS finalizado_por
       FROM bus_linea_asignacion bla
       JOIN linea l ON l.id = bla.linea_id
       LEFT JOIN usuario uc ON uc.id = bla.creado_por
       LEFT JOIN usuario uf ON uf.id = bla.finalizado_por
      WHERE bla.bus_id = $1
      ORDER BY bla.fecha_inicio DESC`,
    [busId],
  );
  return rows;
}
