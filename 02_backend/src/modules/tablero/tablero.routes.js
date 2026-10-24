import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { autenticar } from '../../middlewares/autenticacion.js';
import { resolverAmbito } from '../../middlewares/autorizacion.js';
import { asincrono } from '../../utils/asincrono.js';

const router = Router();

router.use(autenticar, resolverAmbito);

/**
 * GET /api/v1/tablero/mapa
 * Red completa para dibujar el mapa: cada linea con sus estaciones en orden de
 * recorrido y sus coordenadas. El dibujo lo hace el navegador, sin servicios
 * externos de mapas, de modo que el sistema funciona sin conexion a internet.
 */
router.get(
  '/mapa',
  asincrono(async (req, res) => {
    const municipalidadId = req.ambito.municipalidadId ?? null;

    const { rows: lineas } = await pool.query(
      `SELECT l.id, l.codigo, l.nombre, l.color_hex, l.tipo, l.estado, l.tarifa,
              to_char(l.hora_inicio, 'HH24:MI') AS hora_inicio,
              to_char(l.hora_fin, 'HH24:MI')    AS hora_fin,
              l.frecuencia_pico_min, l.frecuencia_valle_min,
              COALESCE(u.unidades_operativas, 0) AS unidades_operativas,
              u.situacion,
              COALESCE(v.longitud_km, 0) AS longitud_km
         FROM linea l
         LEFT JOIN v_unidades_por_linea u ON u.linea_id = l.id
         LEFT JOIN v_linea_longitud v ON v.linea_id = l.id AND v.sentido = 'ida'
        WHERE l.estado <> 'baja'
          AND ($1::bigint IS NULL OR l.municipalidad_id = $1)
        ORDER BY l.codigo`,
      [municipalidadId],
    );

    const { rows: estaciones } = await pool.query(
      `SELECT DISTINCT ON (le.linea_id, le.orden_recorrido)
              le.linea_id, le.orden_recorrido,
              e.id, e.codigo, e.nombre, e.tipo, e.estado,
              e.latitud::float8 AS latitud, e.longitud::float8 AS longitud,
              e.capacidad_personas,
              m.nombre AS municipalidad,
              (SELECT count(*) FROM acceso a WHERE a.estacion_id = e.id)::int AS accesos
         FROM linea_estacion le
         JOIN estacion e ON e.id = le.estacion_id
         JOIN municipalidad m ON m.id = e.municipalidad_id
        WHERE le.sentido = 'ida' AND le.activo
          AND e.latitud IS NOT NULL
        ORDER BY le.linea_id, le.orden_recorrido`,
    );

    const porLinea = new Map();
    for (const e of estaciones) {
      const lista = porLinea.get(String(e.linea_id)) ?? [];
      lista.push(e);
      porLinea.set(String(e.linea_id), lista);
    }

    res.json({
      ok: true,
      datos: lineas.map((l) => ({ ...l, estaciones: porLinea.get(String(l.id)) ?? [] })),
    });
  }),
);

/**
 * GET /api/v1/tablero/indicadores
 * Cifras y series para las graficas del tablero.
 */
router.get(
  '/indicadores',
  asincrono(async (req, res) => {
    const municipalidadId = req.ambito.municipalidadId ?? null;

    const { rows: totales } = await pool.query(
      `SELECT
         (SELECT count(*) FROM linea WHERE estado = 'activa'
           AND ($1::bigint IS NULL OR municipalidad_id = $1))::int AS lineas_activas,
         (SELECT count(*) FROM estacion WHERE estado = 'operativa'
           AND ($1::bigint IS NULL OR municipalidad_id = $1))::int AS estaciones_operativas,
         (SELECT count(*) FROM bus WHERE estado = 'operativo'
           AND ($1::bigint IS NULL OR municipalidad_id = $1))::int AS unidades_operativas,
         (SELECT count(*) FROM bus WHERE estado = 'mantenimiento'
           AND ($1::bigint IS NULL OR municipalidad_id = $1))::int AS unidades_taller,
         (SELECT count(*) FROM v_buses_sin_parqueo)::int AS sin_parqueo,
         (SELECT count(*) FROM alerta WHERE estado <> 'cerrada')::int AS alertas_abiertas,
         (SELECT COALESCE(round(sum(longitud_km), 1), 0) FROM v_linea_longitud
           WHERE sentido = 'ida') AS km_red`,
      [municipalidadId],
    );

    // Unidades por linea frente a su rango: alimenta la grafica de barras
    const { rows: porLinea } = await pool.query(
      `SELECT l.codigo, l.color_hex, l.unidades_minimas, l.unidades_maximas,
              COALESCE(u.unidades_operativas, 0)::int AS unidades,
              u.situacion
         FROM linea l
         LEFT JOIN v_unidades_por_linea u ON u.linea_id = l.id
        WHERE l.estado = 'activa'
          AND ($1::bigint IS NULL OR l.municipalidad_id = $1)
        ORDER BY l.codigo`,
      [municipalidadId],
    );

    // Alertas abiertas por tipo: alimenta la grafica de dona
    const { rows: alertas } = await pool.query(
      `SELECT tipo, severidad, count(*)::int AS total
         FROM v_alertas_abiertas
        GROUP BY tipo, severidad
        ORDER BY total DESC`,
    );

    // Ocupacion media por hora del dia, ultimas 24 horas
    const { rows: ocupacion } = await pool.query(
      `SELECT to_char(date_trunc('hour', fecha_hora), 'HH24:00') AS hora,
              round(avg(porcentaje_ocupacion), 1)::float8 AS promedio,
              count(*)::int AS mediciones,
              count(*) FILTER (WHERE sobrecupo)::int AS sobrecupos
         FROM registro_ocupacion
        WHERE fecha_hora >= now() - INTERVAL '24 hours'
        GROUP BY 1
        ORDER BY 1`,
    );

    res.json({
      ok: true,
      datos: { totales: totales[0], porLinea, alertas, ocupacion },
    });
  }),
);

export default router;
