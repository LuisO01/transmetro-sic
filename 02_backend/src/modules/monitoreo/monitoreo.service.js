import { pool, enTransaccion } from '../../db/pool.js';
import { ApiError } from '../../utils/errores.js';

/**
 * RF-09 y RF-10. El anden de una estacion: las unidades que llegaron y aun no
 * han sido despachadas, con el tiempo que llevan esperando y si ya cumplen la
 * regla de los cinco minutos.
 */
export async function anden(estacionId) {
  const { rows } = await pool.query(
    `SELECT v.id, v.bus_id, b.numero_economico, b.placa, b.capacidad_total,
            v.linea_id, l.codigo AS linea_codigo, l.color_hex,
            v.sentido, v.fecha_hora_llegada, v.ocupacion_salida_pct,
            p.codigo_piloto, per.nombres || ' ' || per.apellidos AS piloto,
            EXTRACT(EPOCH FROM (now() - v.fecha_hora_llegada))::int AS segundos_en_anden,
            -- La regla solo exige espera cuando la ocupacion es menor al 25 %
            (v.ocupacion_salida_pct IS NOT NULL
             AND v.ocupacion_salida_pct < 25
             AND now() - v.fecha_hora_llegada < INTERVAL '5 minutes') AS retenido_por_regla,
            ult.pasajeros_abordo, ult.porcentaje_ocupacion, ult.sobrecupo
       FROM viaje v
       JOIN bus b   ON b.id = v.bus_id
       JOIN linea l ON l.id = v.linea_id
       LEFT JOIN piloto p    ON p.persona_id = v.piloto_id
       LEFT JOIN persona per ON per.id = v.piloto_id
       LEFT JOIN LATERAL (
            SELECT ro.pasajeros_abordo, ro.porcentaje_ocupacion, ro.sobrecupo
              FROM registro_ocupacion ro
             WHERE ro.viaje_id = v.id
             ORDER BY ro.fecha_hora DESC
             LIMIT 1
       ) ult ON true
      WHERE v.estacion_origen_id = $1 AND v.estado = 'en_anden'
      ORDER BY v.fecha_hora_llegada`,
    [estacionId],
  );
  return rows;
}

/** Unidades disponibles para registrar una llegada en la estacion indicada. */
export async function unidadesDisponibles(estacionId) {
  const { rows } = await pool.query(
    `SELECT b.id, b.numero_economico, b.placa, b.capacidad_total,
            bla.linea_id, l.codigo AS linea_codigo, l.color_hex
       FROM bus b
       JOIN bus_linea_asignacion bla ON bla.bus_id = b.id AND bla.fecha_fin IS NULL
       JOIN linea l ON l.id = bla.linea_id
      WHERE b.estado = 'operativo'
        -- La linea debe pasar por la estacion; EXISTS evita duplicar la unidad
        -- cuando el recorrido la incluye en ambos sentidos
        AND EXISTS (
            SELECT 1 FROM linea_estacion le
             WHERE le.linea_id = l.id AND le.estacion_id = $1 AND le.activo
        )
        AND NOT EXISTS (SELECT 1 FROM viaje v WHERE v.bus_id = b.id AND v.estado = 'en_anden')
      ORDER BY b.numero_economico
      LIMIT 100`,
    [estacionId],
  );
  return rows;
}

/** Registra la llegada de una unidad al anden. */
export async function registrarLlegada(datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows: bus } = await cliente.query(
      `SELECT b.id, b.estado, bla.linea_id
         FROM bus b
         LEFT JOIN bus_linea_asignacion bla ON bla.bus_id = b.id AND bla.fecha_fin IS NULL
        WHERE b.id = $1`,
      [datos.busId],
    );
    if (bus.length === 0) throw ApiError.noEncontrado('Unidad');
    if (bus[0].estado !== 'operativo') {
      throw ApiError.invalido('La unidad no esta operativa y no puede recibir pasajeros.');
    }
    if (!bus[0].linea_id) {
      throw ApiError.invalido('La unidad no tiene linea asignada (RF-04).');
    }

    const { rows } = await cliente.query(
      `INSERT INTO viaje (bus_id, linea_id, piloto_id, estacion_origen_id, sentido,
                          fecha_hora_llegada, estado, registrado_por)
       VALUES ($1, $2, $3, $4, $5, now(), 'en_anden', $6)
       RETURNING *`,
      [datos.busId, bus[0].linea_id, datos.pilotoId ?? null, datos.estacionId,
        datos.sentido, usuarioId],
    );
    return rows[0];
  });
}

/**
 * RF-09. Registra la ocupacion de la unidad. El porcentaje y la marca de
 * sobrecupo los calcula la base; el trigger abre la alerta si corresponde.
 */
export async function registrarOcupacion(datos, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows: bus } = await cliente.query(
      'SELECT id, numero_economico, capacidad_total FROM bus WHERE id = $1',
      [datos.busId],
    );
    if (bus.length === 0) throw ApiError.noEncontrado('Unidad');

    const { rows } = await cliente.query(
      `INSERT INTO registro_ocupacion
           (viaje_id, bus_id, estacion_id, pasajeros_abordo, pasajeros_suben,
            pasajeros_bajan, capacidad_referencia, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [datos.viajeId ?? null, datos.busId, datos.estacionId, datos.pasajerosAbordo,
        datos.pasajerosSuben ?? 0, datos.pasajerosBajan ?? 0,
        bus[0].capacidad_total, usuarioId],
    );

    // El viaje guarda la ocupacion con la que sera despachado (RF-10)
    if (datos.viajeId) {
      await cliente.query(
        'UPDATE viaje SET ocupacion_salida_pct = $2 WHERE id = $1 AND estado = \'en_anden\'',
        [datos.viajeId, rows[0].porcentaje_ocupacion],
      );
    }

    return { ...rows[0], unidad: bus[0].numero_economico };
  });
}

/**
 * RF-10. Despacha la unidad. La restriccion ck_viaje_espera_minima de la base
 * rechaza la operacion si la ocupacion es menor al 25 % y no han pasado cinco
 * minutos desde la llegada.
 */
export async function despachar(viajeId, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows: viaje } = await cliente.query(
      `SELECT v.id, v.estado, v.fecha_hora_llegada, v.ocupacion_salida_pct,
              EXTRACT(EPOCH FROM (now() - v.fecha_hora_llegada))::int AS segundos
         FROM viaje v WHERE v.id = $1 FOR UPDATE`,
      [viajeId],
    );
    if (viaje.length === 0) throw ApiError.noEncontrado('Viaje');
    if (viaje[0].estado !== 'en_anden') {
      throw ApiError.conflicto('VIAJE_NO_EN_ANDEN', 'El viaje ya fue despachado o cancelado.');
    }

    // Aviso anticipado y comprensible; la garantia la da el CHECK de la base
    const ocupacion = Number(viaje[0].ocupacion_salida_pct ?? 0);
    const faltan = 300 - viaje[0].segundos;
    if (viaje[0].ocupacion_salida_pct !== null && ocupacion < 25 && faltan > 0) {
      throw ApiError.invalido(
        `La unidad lleva ${ocupacion.toFixed(1)} % de ocupacion. Debe esperar `
        + `${Math.ceil(faltan / 60)} minuto(s) mas para cumplir la regla de los 5 minutos (RF-10).`,
        { segundosRestantes: faltan, ocupacion },
      );
    }

    const { rows } = await cliente.query(
      `UPDATE viaje
          SET fecha_hora_salida = now(), estado = 'despachado'
        WHERE id = $1
        RETURNING *`,
      [viajeId],
    );
    return rows[0];
  });
}

export async function cancelarViaje(viajeId, motivo, usuarioId) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      `UPDATE viaje
          SET estado = 'cancelado', observaciones = COALESCE($2, observaciones)
        WHERE id = $1 AND estado = 'en_anden'
        RETURNING *`,
      [viajeId, motivo ?? null],
    );
    if (rows.length === 0) throw ApiError.noEncontrado('Viaje en anden');
    return rows[0];
  });
}

/** Ocupacion mas reciente de cada unidad en servicio. */
export async function ocupacionActual({ lineaId, soloSobrecupo }) {
  const condiciones = [];
  const valores = [];
  if (lineaId) {
    valores.push(lineaId);
    condiciones.push(`linea_codigo = (SELECT codigo FROM linea WHERE id = $${valores.length})`);
  }
  if (soloSobrecupo) condiciones.push('sobrecupo');

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM v_ocupacion_actual ${where} ORDER BY fecha_hora DESC LIMIT 100`,
    valores,
  );
  return rows;
}

/** Viajes de un piloto, para su propia consulta (ambito propio). */
export async function viajesDePiloto(pilotoId, limite = 30) {
  const { rows } = await pool.query(
    `SELECT v.id, v.sentido, v.fecha_hora_llegada, v.fecha_hora_salida,
            v.ocupacion_salida_pct, v.estado,
            b.numero_economico, l.codigo AS linea_codigo, l.color_hex,
            e.nombre AS estacion_origen
       FROM viaje v
       JOIN bus b      ON b.id = v.bus_id
       JOIN linea l    ON l.id = v.linea_id
       JOIN estacion e ON e.id = v.estacion_origen_id
      WHERE v.piloto_id = $1
      ORDER BY v.fecha_hora_llegada DESC
      LIMIT $2`,
    [pilotoId, limite],
  );
  return rows;
}

/** Resumen del dia para el tablero de monitoreo. */
export async function resumenDelDia(estacionId) {
  const { rows } = await pool.query(
    `SELECT
       (SELECT count(*) FROM viaje
         WHERE ($1::bigint IS NULL OR estacion_origen_id = $1)
           AND fecha_hora_llegada >= date_trunc('day', now()))::int AS viajes_hoy,
       (SELECT count(*) FROM viaje
         WHERE ($1::bigint IS NULL OR estacion_origen_id = $1)
           AND estado = 'en_anden')::int AS en_anden,
       (SELECT count(*) FROM registro_ocupacion
         WHERE ($1::bigint IS NULL OR estacion_id = $1)
           AND fecha_hora >= date_trunc('day', now()))::int AS mediciones_hoy,
       (SELECT count(*) FROM registro_ocupacion
         WHERE ($1::bigint IS NULL OR estacion_id = $1)
           AND sobrecupo AND fecha_hora >= date_trunc('day', now()))::int AS sobrecupos_hoy,
       (SELECT COALESCE(round(avg(porcentaje_ocupacion), 1), 0) FROM registro_ocupacion
         WHERE ($1::bigint IS NULL OR estacion_id = $1)
           AND fecha_hora >= date_trunc('day', now())) AS ocupacion_promedio`,
    [estacionId ?? null],
  );
  return rows[0];
}
