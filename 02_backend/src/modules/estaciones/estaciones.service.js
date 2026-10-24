import { pool, enTransaccion } from '../../db/pool.js';
import { ApiError } from '../../utils/errores.js';

/** RF-01 / RF-13: catalogo de estaciones con su municipalidad. */
export async function listar({ municipalidadId, lineaId, estado, tipo, texto, limite, desplazamiento }) {
  const condiciones = [];
  const valores = [];

  if (municipalidadId) {
    valores.push(municipalidadId);
    condiciones.push(`e.municipalidad_id = $${valores.length}`);
  }
  if (estado) {
    valores.push(estado);
    condiciones.push(`e.estado = $${valores.length}`);
  }
  if (tipo) {
    valores.push(tipo);
    condiciones.push(`e.tipo = $${valores.length}`);
  }
  if (texto) {
    valores.push(`%${texto}%`);
    condiciones.push(`(e.nombre ILIKE $${valores.length} OR e.codigo ILIKE $${valores.length})`);
  }
  if (lineaId) {
    valores.push(lineaId);
    condiciones.push(
      `EXISTS (SELECT 1 FROM linea_estacion le
                WHERE le.estacion_id = e.id AND le.linea_id = $${valores.length} AND le.activo)`,
    );
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  valores.push(limite, desplazamiento);

  const { rows } = await pool.query(
    `SELECT e.id, e.codigo, e.nombre, e.tipo, e.estado, e.latitud, e.longitud,
            e.capacidad_personas, e.direccion_referencia,
            e.municipalidad_id, m.nombre AS municipalidad,
            r.total_accesos, r.total_lineas, r.guardias_requeridos,
            count(*) OVER () AS total_registros
       FROM estacion e
       JOIN municipalidad m ON m.id = e.municipalidad_id
       LEFT JOIN v_resumen_estaciones r ON r.estacion_id = e.id
       ${where}
      ORDER BY e.codigo
      LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
    valores,
  );

  const total = rows.length ? Number(rows[0].total_registros) : 0;
  return { total, items: rows.map(({ total_registros: _t, ...fila }) => fila) };
}

export async function obtener(id) {
  const { rows } = await pool.query(
    `SELECT e.*, m.nombre AS municipalidad
       FROM estacion e
       JOIN municipalidad m ON m.id = e.municipalidad_id
      WHERE e.id = $1`,
    [id],
  );
  if (rows.length === 0) throw ApiError.noEncontrado('Estacion');

  const { rows: lineas } = await pool.query(
    `SELECT l.id, l.codigo, l.nombre, l.color_hex, le.sentido, le.orden_recorrido
       FROM linea_estacion le
       JOIN linea l ON l.id = le.linea_id
      WHERE le.estacion_id = $1 AND le.activo
      ORDER BY l.codigo, le.sentido, le.orden_recorrido`,
    [id],
  );

  const { rows: accesos } = await pool.query(
    `SELECT id, codigo, nombre, tipo, torniquetes, guardias_minimos, estado
       FROM acceso WHERE estacion_id = $1 ORDER BY codigo`,
    [id],
  );

  return { ...rows[0], lineas, accesos };
}

export async function crear(datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `INSERT INTO estacion (codigo, nombre, municipalidad_id, tipo, latitud, longitud,
                             capacidad_personas, direccion_referencia, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        datos.codigo, datos.nombre, datos.municipalidadId, datos.tipo,
        datos.latitud ?? null, datos.longitud ?? null,
        datos.capacidadPersonas, datos.direccionReferencia ?? null, datos.estado,
      ],
    );
    return rows[0];
  });
}

export async function actualizar(id, datos, usuarioId) {
  const mapa = {
    nombre: 'nombre',
    municipalidadId: 'municipalidad_id',
    tipo: 'tipo',
    latitud: 'latitud',
    longitud: 'longitud',
    capacidadPersonas: 'capacidad_personas',
    direccionReferencia: 'direccion_referencia',
    estado: 'estado',
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
      `UPDATE estacion SET ${asignaciones.join(', ')} WHERE id = $1 RETURNING *`,
      valores,
    );
    if (rows.length === 0) throw ApiError.noEncontrado('Estacion');
    return rows[0];
  });
}

/** Cierre logico. Se impide si la estacion sigue en el recorrido de una linea activa. */
export async function cerrar(id, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows: enUso } = await cliente.query(
      `SELECT count(*)::int AS total
         FROM linea_estacion le
         JOIN linea l ON l.id = le.linea_id
        WHERE le.estacion_id = $1 AND le.activo AND l.estado = 'activa'`,
      [id],
    );
    if (enUso[0].total > 0) {
      throw ApiError.conflicto(
        'ESTACION_EN_RECORRIDO',
        `La estacion forma parte del recorrido de ${enUso[0].total} linea(s) activa(s). `
        + 'Retirela del recorrido antes de cerrarla.',
      );
    }

    const { rows } = await cliente.query(
      "UPDATE estacion SET estado = 'cerrada' WHERE id = $1 RETURNING id, codigo, estado",
      [id],
    );
    if (rows.length === 0) throw ApiError.noEncontrado('Estacion');
    return rows[0];
  });
}
