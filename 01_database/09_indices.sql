-- =============================================================================
-- SIC Transmetro | 09_indices.sql
-- Indices de apoyo al RNF de tiempo de respuesta (< 3 s bajo carga normal).
-- Las llaves primarias y las restricciones UNIQUE ya generan su propio indice;
-- aqui solo se cubren las llaves foraneas y los filtros mas frecuentes.
-- =============================================================================

SET search_path = transmetro, public;

-- --- Red ---------------------------------------------------------------------
CREATE INDEX ix_estacion_municipalidad   ON estacion (municipalidad_id);
CREATE INDEX ix_estacion_estado          ON estacion (estado);
CREATE INDEX ix_linea_municipalidad      ON linea (municipalidad_id);
CREATE INDEX ix_linea_estado             ON linea (estado);
CREATE INDEX ix_linea_estacion_estacion  ON linea_estacion (estacion_id);
CREATE INDEX ix_linea_estacion_recorrido ON linea_estacion (linea_id, sentido, orden_recorrido);
CREATE INDEX ix_acceso_estacion          ON acceso (estacion_id);

-- --- Flota -------------------------------------------------------------------
CREATE INDEX ix_bus_municipalidad        ON bus (municipalidad_id);
CREATE INDEX ix_bus_estado               ON bus (estado);
CREATE INDEX ix_bus_asignacion_linea     ON bus_linea_asignacion (linea_id);
CREATE INDEX ix_bus_asignacion_vigente_linea
    ON bus_linea_asignacion (linea_id)
    WHERE fecha_fin IS NULL;
CREATE INDEX ix_parqueo_espacio_predio   ON parqueo_espacio (predio_id);
CREATE INDEX ix_parqueo_asig_vigente     ON parqueo_asignacion (bus_id) WHERE fecha_fin IS NULL;

-- --- Personal ----------------------------------------------------------------
CREATE INDEX ix_persona_municipalidad    ON persona (municipalidad_id);
CREATE INDEX ix_persona_apellidos        ON persona (apellidos, nombres);
CREATE INDEX ix_guardia_asig_acceso      ON guardia_asignacion (acceso_id, fecha);
CREATE INDEX ix_guardia_asig_guardia     ON guardia_asignacion (guardia_id, fecha);

-- --- Operacion ---------------------------------------------------------------
CREATE INDEX ix_viaje_linea_fecha        ON viaje (linea_id, fecha_hora_llegada DESC);
CREATE INDEX ix_viaje_bus_fecha          ON viaje (bus_id, fecha_hora_llegada DESC);
CREATE INDEX ix_ocupacion_bus_fecha      ON registro_ocupacion (bus_id, fecha_hora DESC);
CREATE INDEX ix_ocupacion_estacion_fecha ON registro_ocupacion (estacion_id, fecha_hora DESC);
CREATE INDEX ix_ocupacion_sobrecupo      ON registro_ocupacion (fecha_hora DESC) WHERE sobrecupo;
CREATE INDEX ix_alerta_abiertas          ON alerta (tipo, generada_en DESC) WHERE estado <> 'cerrada';
CREATE INDEX ix_alerta_linea             ON alerta (linea_id) WHERE linea_id IS NOT NULL;
CREATE INDEX ix_alerta_estacion          ON alerta (estacion_id) WHERE estacion_id IS NOT NULL;

-- --- Tecnica -----------------------------------------------------------------
CREATE INDEX ix_equipo_estacion          ON equipo_computo (estacion_id, estado);
CREATE INDEX ix_conectividad_estacion    ON registro_conectividad (estacion_id, fecha_hora DESC);

-- --- Pagos -------------------------------------------------------------------
CREATE INDEX ix_transaccion_tarjeta      ON transaccion_pago (tarjeta_id, fecha_hora DESC);
CREATE INDEX ix_transaccion_estacion_dia ON transaccion_pago (estacion_id, fecha_hora DESC);
CREATE INDEX ix_conciliacion_fecha       ON conciliacion (fecha DESC);

-- --- Seguridad y auditoria ---------------------------------------------------
CREATE INDEX ix_usuario_municipalidad    ON usuario (municipalidad_id);
CREATE INDEX ix_usuario_estacion         ON usuario (estacion_id);
CREATE INDEX ix_usuario_rol_rol          ON usuario_rol (rol_id);
CREATE INDEX ix_sesion_usuario           ON sesion_refresh (usuario_id) WHERE revocado_en IS NULL;
CREATE INDEX ix_bitacora_fecha           ON bitacora_auditoria (fecha_hora DESC);
CREATE INDEX ix_bitacora_usuario         ON bitacora_auditoria (usuario_id, fecha_hora DESC);
CREATE INDEX ix_bitacora_tabla           ON bitacora_auditoria (tabla_afectada, registro_id);

\echo '>>> 09 Indices creados'
