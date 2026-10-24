-- =============================================================================
-- SIC Transmetro | 10_vistas.sql
-- Vistas de consulta y soporte a reportes consolidados (RF-02, RF-05, RF-06,
-- RF-08, RF-11, RF-12, RF-14, RF-15).
-- =============================================================================

SET search_path = transmetro, public;

-- ----------------------------------------------------------------------------
-- RF-02: longitud total por linea y sentido (dato derivado, no almacenado)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_linea_longitud AS
SELECT l.id                                            AS linea_id,
       l.codigo,
       l.nombre,
       l.estado,
       le.sentido,
       count(*)::integer                               AS total_estaciones,
       COALESCE(sum(le.distancia_km_siguiente), 0)     AS longitud_km,
       COALESCE(sum(le.tiempo_estimado_min), 0)        AS tiempo_estimado_min
  FROM linea l
  JOIN linea_estacion le ON le.linea_id = l.id AND le.activo
 GROUP BY l.id, l.codigo, l.nombre, l.estado, le.sentido;

COMMENT ON VIEW v_linea_longitud IS
    'RF-02: longitud total de cada linea como suma de las distancias entre estaciones.';

-- ----------------------------------------------------------------------------
-- RF-01 / RF-02: recorrido ordenado con la estacion siguiente
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_linea_recorrido AS
SELECT le.linea_id,
       l.codigo                AS linea_codigo,
       le.sentido,
       le.orden_recorrido,
       e.id                    AS estacion_id,
       e.codigo                AS estacion_codigo,
       e.nombre                AS estacion_nombre,
       e.tipo                  AS estacion_tipo,
       m.nombre                AS municipalidad,
       le.distancia_km_siguiente,
       le.tiempo_estimado_min,
       lead(e.nombre) OVER w   AS estacion_siguiente
  FROM linea_estacion le
  JOIN linea    l ON l.id = le.linea_id
  JOIN estacion e ON e.id = le.estacion_id
  JOIN municipalidad m ON m.id = e.municipalidad_id
 WHERE le.activo
WINDOW w AS (PARTITION BY le.linea_id, le.sentido ORDER BY le.orden_recorrido);

-- ----------------------------------------------------------------------------
-- RF-04 / RF-05: unidades vigentes por linea y evaluacion del rango
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_unidades_por_linea AS
SELECT l.id                AS linea_id,
       l.codigo,
       l.nombre,
       l.estado,
       l.unidades_minimas,
       l.unidades_maximas,
       count(b.id)::integer AS unidades_operativas,
       CASE
           WHEN l.estado <> 'activa'                     THEN 'sin_evaluar'
           WHEN count(b.id) < l.unidades_minimas         THEN 'bajo_minimo'
           WHEN count(b.id) > l.unidades_maximas         THEN 'sobre_maximo'
           ELSE 'en_rango'
       END                 AS situacion
  FROM linea l
  LEFT JOIN bus_linea_asignacion bla
         ON bla.linea_id = l.id AND bla.fecha_fin IS NULL
  LEFT JOIN bus b
         ON b.id = bla.bus_id AND b.estado = 'operativo'
 GROUP BY l.id, l.codigo, l.nombre, l.estado, l.unidades_minimas, l.unidades_maximas;

COMMENT ON VIEW v_unidades_por_linea IS
    'RF-05: base de la alerta por operacion fuera del rango minimo/maximo de unidades.';

-- ----------------------------------------------------------------------------
-- RF-06: unidades operativas sin parqueo vigente
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_buses_sin_parqueo AS
SELECT b.id           AS bus_id,
       b.numero_economico,
       b.placa,
       b.tipo,
       b.estado,
       m.nombre       AS municipalidad,
       bla.linea_id,
       l.codigo       AS linea_codigo
  FROM bus b
  JOIN municipalidad m ON m.id = b.municipalidad_id
  LEFT JOIN bus_linea_asignacion bla ON bla.bus_id = b.id AND bla.fecha_fin IS NULL
  LEFT JOIN linea l ON l.id = bla.linea_id
 WHERE b.estado = 'operativo'
   AND NOT EXISTS (
       SELECT 1 FROM parqueo_asignacion pa
        WHERE pa.bus_id = b.id AND pa.fecha_fin IS NULL
   );

-- ----------------------------------------------------------------------------
-- RF-06: ocupacion de los predios de parqueo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ocupacion_parqueos AS
SELECT p.id                                  AS predio_id,
       p.codigo,
       p.nombre,
       m.nombre                              AS municipalidad,
       count(pe.id)::integer                 AS espacios_totales,
       count(pa.id)::integer                 AS espacios_ocupados,
       count(pe.id) - count(pa.id)           AS espacios_libres
  FROM parqueo_predio p
  JOIN municipalidad m ON m.id = p.municipalidad_id
  LEFT JOIN parqueo_espacio pe ON pe.predio_id = p.id AND pe.estado <> 'inhabilitado'
  LEFT JOIN parqueo_asignacion pa ON pa.espacio_id = pe.id AND pa.fecha_fin IS NULL
 WHERE p.activo
 GROUP BY p.id, p.codigo, p.nombre, m.nombre;

-- ----------------------------------------------------------------------------
-- RF-08: cobertura de guardias por acceso y turno (ventana de 7 dias)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_cobertura_guardias AS
SELECT a.id                                       AS acceso_id,
       a.nombre                                   AS acceso,
       a.estacion_id,
       e.nombre                                   AS estacion,
       f.dia::date                                AS fecha,
       t.id                                       AS turno_id,
       t.codigo                                   AS turno,
       a.guardias_minimos                         AS requeridos,
       COALESCE(c.total, 0)::integer              AS asignados,
       (COALESCE(c.total, 0) >= a.guardias_minimos) AS cumple
  FROM acceso a
  JOIN estacion e ON e.id = a.estacion_id
  CROSS JOIN generate_series(CURRENT_DATE, CURRENT_DATE + 6, INTERVAL '1 day') AS f(dia)
  JOIN turno t ON t.activo
  LEFT JOIN LATERAL (
        SELECT count(*) AS total
          FROM guardia_asignacion ga
         WHERE ga.acceso_id = a.id
           AND ga.turno_id  = t.id
           AND ga.fecha     = f.dia::date
           AND ga.estado IN ('programado', 'presente', 'cubierto')
  ) c ON true
 WHERE a.estado = 'habilitado';

COMMENT ON VIEW v_cobertura_guardias IS
    'RF-08: compara la cobertura programada contra acceso.guardias_minimos por turno.';

-- ----------------------------------------------------------------------------
-- RF-09: ocupacion reciente por unidad
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ocupacion_actual AS
SELECT DISTINCT ON (ro.bus_id)
       ro.bus_id,
       b.numero_economico,
       l.codigo            AS linea_codigo,
       e.nombre            AS estacion,
       ro.fecha_hora,
       ro.pasajeros_abordo,
       ro.capacidad_referencia,
       ro.porcentaje_ocupacion,
       ro.sobrecupo
  FROM registro_ocupacion ro
  JOIN bus b      ON b.id = ro.bus_id
  JOIN estacion e ON e.id = ro.estacion_id
  LEFT JOIN bus_linea_asignacion bla ON bla.bus_id = b.id AND bla.fecha_fin IS NULL
  LEFT JOIN linea l ON l.id = bla.linea_id
 ORDER BY ro.bus_id, ro.fecha_hora DESC;

-- ----------------------------------------------------------------------------
-- RF-11: estado tecnico consolidado por estacion
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_estado_tecnico_estacion AS
SELECT e.id                                                          AS estacion_id,
       e.codigo,
       e.nombre,
       m.nombre                                                      AS municipalidad,
       count(eq.id)::integer                                         AS equipos_totales,
       count(eq.id) FILTER (WHERE eq.estado = 'operativo')::integer  AS equipos_operativos,
       count(eq.id) FILTER (WHERE eq.estado <> 'operativo')::integer AS equipos_con_falla,
       ult.estado_enlace                                             AS ultimo_estado_enlace,
       ult.fecha_hora                                                AS ultima_medicion,
       ult.latencia_ms
  FROM estacion e
  JOIN municipalidad m ON m.id = e.municipalidad_id
  LEFT JOIN equipo_computo eq ON eq.estacion_id = e.id AND eq.estado <> 'baja'
  LEFT JOIN LATERAL (
        SELECT rc.estado_enlace, rc.fecha_hora, rc.latencia_ms
          FROM registro_conectividad rc
         WHERE rc.estacion_id = e.id
         ORDER BY rc.fecha_hora DESC
         LIMIT 1
  ) ult ON true
 GROUP BY e.id, e.codigo, e.nombre, m.nombre,
          ult.estado_enlace, ult.fecha_hora, ult.latencia_ms;

-- ----------------------------------------------------------------------------
-- RF-12: conciliacion diaria calculada desde las transacciones
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_conciliacion_diaria AS
SELECT tp.estacion_id,
       e.nombre                                     AS estacion,
       (tp.fecha_hora AT TIME ZONE 'America/Guatemala')::date AS fecha,
       count(*)::integer                            AS total_transacciones,
       sum(tp.monto)                                AS monto_sistema,
       c.monto_reportado,
       c.diferencia,
       COALESCE(c.estado, 'descuadrada'::estado_conciliacion) AS estado
  FROM transaccion_pago tp
  JOIN estacion e ON e.id = tp.estacion_id
  LEFT JOIN conciliacion c
         ON c.estacion_id = tp.estacion_id
        AND c.fecha = (tp.fecha_hora AT TIME ZONE 'America/Guatemala')::date
 WHERE tp.estado = 'aplicada'
   AND tp.tipo IN ('abordaje', 'recarga')
 GROUP BY tp.estacion_id, e.nombre,
          (tp.fecha_hora AT TIME ZONE 'America/Guatemala')::date,
          c.monto_reportado, c.diferencia, c.estado;

-- ----------------------------------------------------------------------------
-- RF-14: resumen consolidado de estaciones (insumo del reporte gerencial)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_resumen_estaciones AS
SELECT e.id                                        AS estacion_id,
       e.codigo,
       e.nombre,
       e.tipo,
       e.estado,
       m.nombre                                    AS municipalidad,
       e.capacidad_personas,
       count(DISTINCT a.id)::integer               AS total_accesos,
       count(DISTINCT le.linea_id)::integer        AS total_lineas,
       sum(a.guardias_minimos)::integer            AS guardias_requeridos
  FROM estacion e
  JOIN municipalidad m ON m.id = e.municipalidad_id
  LEFT JOIN acceso a         ON a.estacion_id = e.id AND a.estado = 'habilitado'
  LEFT JOIN linea_estacion le ON le.estacion_id = e.id AND le.activo
 GROUP BY e.id, e.codigo, e.nombre, e.tipo, e.estado, m.nombre, e.capacidad_personas;

-- ----------------------------------------------------------------------------
-- Bandeja de alertas abiertas con su contexto
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_alertas_abiertas AS
SELECT al.id,
       al.tipo,
       al.severidad,
       al.estado,
       al.mensaje,
       al.detalle,
       al.generada_en,
       l.codigo AS linea_codigo,
       e.codigo AS estacion_codigo,
       e.municipalidad_id,
       COALESCE(e.municipalidad_id, l.municipalidad_id) AS municipalidad_ambito
  FROM alerta al
  LEFT JOIN linea l    ON l.id = al.linea_id
  LEFT JOIN estacion e ON e.id = al.estacion_id
 WHERE al.estado <> 'cerrada';

-- ----------------------------------------------------------------------------
-- RF-15: permisos efectivos por usuario (nivel mas alto entre sus roles)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_permisos_usuario AS
SELECT u.id                     AS usuario_id,
       u.username,
       mo.codigo                AS modulo,
       (ARRAY['L', 'E', 'A'])[max(
           CASE rp.nivel WHEN 'L' THEN 1 WHEN 'E' THEN 2 WHEN 'A' THEN 3 END
       )]::nivel_permiso        AS nivel
  FROM usuario u
  JOIN usuario_rol ur ON ur.usuario_id = u.id
  JOIN rol r          ON r.id = ur.rol_id AND r.activo
  JOIN rol_permiso rp ON rp.rol_id = r.id
  JOIN modulo mo      ON mo.id = rp.modulo_id
 WHERE u.estado = 'activo'
 GROUP BY u.id, u.username, mo.codigo;

COMMENT ON VIEW v_permisos_usuario IS
    'RF-15: matriz de permisos efectiva. Si el usuario tiene varios roles gana el nivel mayor.';

\echo '>>> 10 Vistas creadas'
