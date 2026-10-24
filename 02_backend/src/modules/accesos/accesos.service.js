import { pool, enTransaccion } from '../../db/pool.js';
import { ApiError } from '../../utils/errores.js';

/** RF-03: inventario de accesos de una estacion. */
export async function listarPorEstacion(estacionId) {
  const { rows } = await pool.query(
    `SELECT a.id, a.codigo, a.nombre, a.tipo, a.torniquetes, a.guardias_minimos,
            a.estado, a.observaciones
       FROM acceso a
      WHERE a.estacion_id = $1
      ORDER BY a.codigo`,
    [estacionId],
  );
  return rows;
}

export async function obtener(id) {
  const { rows } = await pool.query(
    `SELECT a.*, e.codigo AS estacion_codigo, e.nombre AS estacion_nombre, e.municipalidad_id
       FROM acceso a
       JOIN estacion e ON e.id = a.estacion_id
      WHERE a.id = $1`,
    [id],
  );
  if (rows.length === 0) throw ApiError.noEncontrado('Acceso');
  return rows[0];
}

export async function crear(estacionId, datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `INSERT INTO acceso (estacion_id, codigo, nombre, tipo, torniquetes,
                           guardias_minimos, estado, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        estacionId, datos.codigo, datos.nombre, datos.tipo, datos.torniquetes,
        datos.guardiasMinimos, datos.estado, datos.observaciones ?? null,
      ],
    );
    return rows[0];
  });
}

export async function actualizar(id, datos, usuarioId) {
  const mapa = {
    nombre: 'nombre',
    tipo: 'tipo',
    torniquetes: 'torniquetes',
    guardiasMinimos: 'guardias_minimos',
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
      `UPDATE acceso SET ${asignaciones.join(', ')} WHERE id = $1 RETURNING *`,
      valores,
    );
    if (rows.length === 0) throw ApiError.noEncontrado('Acceso');

    // Cambiar el minimo de guardias o el estado reevalua la cobertura (RF-08)
    await cliente.query('SELECT fn_evaluar_cobertura_acceso($1, CURRENT_DATE)', [id]);
    return rows[0];
  });
}

export async function eliminar(id, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      "UPDATE acceso SET estado = 'cerrado' WHERE id = $1 RETURNING id, codigo, estado",
      [id],
    );
    if (rows.length === 0) throw ApiError.noEncontrado('Acceso');
    return rows[0];
  });
}

/** RF-08: cobertura programada del acceso en la ventana de 7 dias. */
export async function cobertura(id) {
  const { rows } = await pool.query(
    `SELECT fecha, turno, requeridos, asignados, cumple
       FROM v_cobertura_guardias
      WHERE acceso_id = $1
      ORDER BY fecha, turno`,
    [id],
  );
  return rows;
}
