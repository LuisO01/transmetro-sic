-- =============================================================================
-- SIC Transmetro | 08_reglas_negocio.sql
-- Funciones y triggers que implementan las reglas que no pueden expresarse
-- como restricciones declarativas.
--   RF-05  Alerta por rango minimo/maximo de unidades por linea
--   RF-06  Alerta por bus operativo sin parqueo vigente
--   RF-08  Alerta por cobertura de guardias por debajo del minimo del acceso
--   RF-09  Alerta por sobrecupo (mas del 150 % de la capacidad)
--   RF-16  Bitacora de auditoria generica
-- =============================================================================

SET search_path = transmetro, public;

-- ============================================================================
-- 1. CONTEXTO DE USUARIO
-- El backend ejecuta   SET LOCAL app.usuario_id = '<id>'   al inicio de cada
-- transaccion; de ahi lo toman la auditoria y las columnas de trazabilidad.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_usuario_actual()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SET search_path = transmetro, public
AS $$
DECLARE
    v_valor text;
BEGIN
    v_valor := current_setting('app.usuario_id', true);
    IF v_valor IS NULL OR v_valor = '' THEN
        RETURN NULL;
    END IF;
    RETURN v_valor::bigint;
EXCEPTION
    WHEN others THEN
        RETURN NULL;
END;
$$;

COMMENT ON FUNCTION fn_usuario_actual() IS
    'Devuelve el usuario de la sesion de aplicacion (GUC app.usuario_id) o NULL.';

-- ============================================================================
-- 2. COLUMNAS DE TRAZABILIDAD  (creado_* / actualizado_*)
-- Trigger generico: opera sobre cualquier tabla que declare esas columnas.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_set_trazabilidad()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = transmetro, public
AS $$
DECLARE
    v_fila    jsonb;
    v_usuario bigint := fn_usuario_actual();
BEGIN
    v_fila := to_jsonb(NEW);

    IF TG_OP = 'INSERT' THEN
        IF v_fila ? 'creado_en' THEN
            v_fila := jsonb_set(v_fila, '{creado_en}', to_jsonb(now()));
        END IF;
        IF v_fila ? 'creado_por' AND v_fila->>'creado_por' IS NULL AND v_usuario IS NOT NULL THEN
            v_fila := jsonb_set(v_fila, '{creado_por}', to_jsonb(v_usuario));
        END IF;
    ELSE
        IF v_fila ? 'actualizado_en' THEN
            v_fila := jsonb_set(v_fila, '{actualizado_en}', to_jsonb(now()));
        END IF;
        IF v_fila ? 'actualizado_por' AND v_usuario IS NOT NULL THEN
            v_fila := jsonb_set(v_fila, '{actualizado_por}', to_jsonb(v_usuario));
        END IF;
    END IF;

    NEW := jsonb_populate_record(NEW, v_fila);
    RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. BITACORA DE AUDITORIA  (RF-16)
-- Uso:  CREATE TRIGGER ... EXECUTE FUNCTION fn_auditoria('NOMBRE_MODULO');
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = transmetro, public
AS $$
DECLARE
    v_modulo    varchar(40) := COALESCE(TG_ARGV[0], TG_TABLE_NAME);
    v_usuario   bigint      := fn_usuario_actual();
    v_username  varchar(40);
    v_anterior  jsonb;
    v_nuevo     jsonb;
    v_registro  bigint;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        v_anterior := to_jsonb(OLD);
    END IF;
    IF TG_OP <> 'DELETE' THEN
        v_nuevo := to_jsonb(NEW);
    END IF;

    v_registro := COALESCE((v_nuevo->>'id')::bigint, (v_anterior->>'id')::bigint);

    -- En UPDATE solo se conservan los campos que realmente cambiaron
    IF TG_OP = 'UPDATE' THEN
        SELECT jsonb_object_agg(clave, v_anterior->clave),
               jsonb_object_agg(clave, v_nuevo->clave)
          INTO v_anterior, v_nuevo
          FROM jsonb_object_keys(v_nuevo) AS t(clave)
         WHERE v_nuevo->clave IS DISTINCT FROM v_anterior->clave;

        IF v_nuevo IS NULL THEN      -- ningun cambio efectivo
            RETURN NULL;
        END IF;
    END IF;

    SELECT username INTO v_username FROM usuario WHERE id = v_usuario;

    INSERT INTO bitacora_auditoria (
        usuario_id, username_snapshot, accion, modulo,
        tabla_afectada, registro_id, datos_anteriores, datos_nuevos
    ) VALUES (
        v_usuario, v_username, TG_OP::accion_auditoria, v_modulo,
        TG_TABLE_NAME, v_registro, v_anterior, v_nuevo
    );

    RETURN NULL;   -- trigger AFTER: el valor de retorno se ignora
END;
$$;

-- ============================================================================
-- 4. HELPERS DE ALERTAS
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_alerta_abrir(
    p_tipo        tipo_alerta,
    p_severidad   severidad_alerta,
    p_tabla       varchar,
    p_entidad_id  bigint,
    p_linea_id    bigint,
    p_estacion_id bigint,
    p_mensaje     varchar,
    p_detalle     jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = transmetro, public
AS $$
BEGIN
    INSERT INTO alerta (
        tipo, severidad, estado, entidad_tabla, entidad_id,
        linea_id, estacion_id, mensaje, detalle, generada_en
    ) VALUES (
        p_tipo, p_severidad, 'abierta', p_tabla, p_entidad_id,
        p_linea_id, p_estacion_id, p_mensaje, p_detalle, now()
    )
    ON CONFLICT (tipo, entidad_tabla, entidad_id) WHERE estado <> 'cerrada'
    DO UPDATE SET
        severidad   = EXCLUDED.severidad,
        mensaje     = EXCLUDED.mensaje,
        detalle     = EXCLUDED.detalle,
        generada_en = now();
END;
$$;

CREATE OR REPLACE FUNCTION fn_alerta_cerrar(
    p_tipo       tipo_alerta,
    p_tabla      varchar,
    p_entidad_id bigint,
    p_nota       varchar DEFAULT 'Condicion normalizada automaticamente'
)
RETURNS void
LANGUAGE plpgsql
SET search_path = transmetro, public
AS $$
BEGIN
    UPDATE alerta
       SET estado        = 'cerrada',
           atendida_en   = now(),
           nota_atencion = p_nota
     WHERE tipo          = p_tipo
       AND entidad_tabla = p_tabla
       AND entidad_id    = p_entidad_id
       AND estado       <> 'cerrada';
END;
$$;

-- ============================================================================
-- 5. RF-05: RANGO MINIMO / MAXIMO DE UNIDADES POR LINEA
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_unidades_activas(p_linea_id bigint)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = transmetro, public
AS $$
    SELECT count(*)::integer
      FROM bus_linea_asignacion bla
      JOIN bus b ON b.id = bla.bus_id
     WHERE bla.linea_id  = p_linea_id
       AND bla.fecha_fin IS NULL
       AND b.estado      = 'operativo';
$$;

CREATE OR REPLACE FUNCTION fn_evaluar_rango_unidades(p_linea_id bigint)
RETURNS void
LANGUAGE plpgsql
SET search_path = transmetro, public
AS $$
DECLARE
    v_linea   linea%ROWTYPE;
    v_activas integer;
BEGIN
    SELECT * INTO v_linea FROM linea WHERE id = p_linea_id;
    IF NOT FOUND OR v_linea.estado <> 'activa' THEN
        PERFORM fn_alerta_cerrar('rango_unidades', 'linea', p_linea_id,
                                 'La linea no se encuentra en operacion');
        RETURN;
    END IF;

    v_activas := fn_unidades_activas(p_linea_id);

    IF v_activas < v_linea.unidades_minimas THEN
        PERFORM fn_alerta_abrir(
            'rango_unidades', 'critica', 'linea', p_linea_id, p_linea_id, NULL,
            format('La linea %s opera con %s unidades, por debajo del minimo de %s.',
                   v_linea.codigo, v_activas, v_linea.unidades_minimas),
            jsonb_build_object('activas', v_activas,
                               'minimo',  v_linea.unidades_minimas,
                               'maximo',  v_linea.unidades_maximas)
        );
    ELSIF v_activas > v_linea.unidades_maximas THEN
        PERFORM fn_alerta_abrir(
            'rango_unidades', 'advertencia', 'linea', p_linea_id, p_linea_id, NULL,
            format('La linea %s tiene %s unidades asignadas, por encima del maximo de %s.',
                   v_linea.codigo, v_activas, v_linea.unidades_maximas),
            jsonb_build_object('activas', v_activas,
                               'minimo',  v_linea.unidades_minimas,
                               'maximo',  v_linea.unidades_maximas)
        );
    ELSE
        PERFORM fn_alerta_cerrar('rango_unidades', 'linea', p_linea_id);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_tg_rango_unidades()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = transmetro, public
AS $$
DECLARE
    v_lineas bigint[] := ARRAY[]::bigint[];
    v_id     bigint;
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_lineas := v_lineas || NEW.linea_id;
    END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_lineas := v_lineas || OLD.linea_id;
    END IF;

    FOREACH v_id IN ARRAY v_lineas LOOP
        PERFORM fn_evaluar_rango_unidades(v_id);
    END LOOP;

    RETURN NULL;
END;
$$;

CREATE TRIGGER tg_asignacion_rango_unidades
    AFTER INSERT OR UPDATE OR DELETE ON bus_linea_asignacion
    FOR EACH ROW EXECUTE FUNCTION fn_tg_rango_unidades();

-- Cambiar el estado de un bus tambien altera el conteo de unidades operativas
CREATE OR REPLACE FUNCTION fn_tg_bus_estado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = transmetro, public
AS $$
DECLARE
    v_linea_id bigint;
BEGIN
    SELECT linea_id INTO v_linea_id
      FROM bus_linea_asignacion
     WHERE bus_id = NEW.id AND fecha_fin IS NULL;

    IF v_linea_id IS NOT NULL THEN
        PERFORM fn_evaluar_rango_unidades(v_linea_id);
    END IF;

    PERFORM fn_evaluar_parqueo_bus(NEW.id);
    RETURN NULL;
END;
$$;

-- ============================================================================
-- 6. RF-06: TODO BUS OPERATIVO DEBE TENER PARQUEO VIGENTE
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_evaluar_parqueo_bus(p_bus_id bigint)
RETURNS void
LANGUAGE plpgsql
SET search_path = transmetro, public
AS $$
DECLARE
    v_bus     bus%ROWTYPE;
    v_vigente boolean;
BEGIN
    SELECT * INTO v_bus FROM bus WHERE id = p_bus_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM parqueo_asignacion
         WHERE bus_id = p_bus_id AND fecha_fin IS NULL
    ) INTO v_vigente;

    IF v_bus.estado = 'operativo' AND NOT v_vigente THEN
        PERFORM fn_alerta_abrir(
            'bus_sin_parqueo', 'advertencia', 'bus', p_bus_id, NULL, NULL,
            format('La unidad %s (placa %s) esta operativa y no tiene parqueo asignado.',
                   v_bus.numero_economico, v_bus.placa),
            jsonb_build_object('placa', v_bus.placa, 'estado', v_bus.estado)
        );
    ELSE
        PERFORM fn_alerta_cerrar('bus_sin_parqueo', 'bus', p_bus_id);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_tg_parqueo_asignacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = transmetro, public
AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        PERFORM fn_evaluar_parqueo_bus(NEW.bus_id);
    END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM fn_evaluar_parqueo_bus(OLD.bus_id);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER tg_parqueo_asignacion_alerta
    AFTER INSERT OR UPDATE OR DELETE ON parqueo_asignacion
    FOR EACH ROW EXECUTE FUNCTION fn_tg_parqueo_asignacion();

CREATE TRIGGER tg_bus_estado_alerta
    AFTER INSERT OR UPDATE OF estado ON bus
    FOR EACH ROW EXECUTE FUNCTION fn_tg_bus_estado();

-- Validacion del tipo de unidad admitido por el espacio
CREATE OR REPLACE FUNCTION fn_validar_espacio_parqueo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = transmetro, public
AS $$
DECLARE
    v_tipo_permitido tipo_bus;
    v_estado_espacio estado_espacio;
    v_tipo_bus       tipo_bus;
BEGIN
    SELECT tipo_permitido, estado INTO v_tipo_permitido, v_estado_espacio
      FROM parqueo_espacio WHERE id = NEW.espacio_id;

    IF v_estado_espacio = 'inhabilitado' THEN
        RAISE EXCEPTION 'El espacio de parqueo % esta inhabilitado', NEW.espacio_id
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT tipo INTO v_tipo_bus FROM bus WHERE id = NEW.bus_id;

    IF v_tipo_permitido IS NOT NULL AND v_tipo_permitido <> v_tipo_bus THEN
        RAISE EXCEPTION 'El espacio admite unidades tipo % y la unidad es tipo %',
            v_tipo_permitido, v_tipo_bus
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_validar_espacio_parqueo
    BEFORE INSERT OR UPDATE ON parqueo_asignacion
    FOR EACH ROW EXECUTE FUNCTION fn_validar_espacio_parqueo();

-- ============================================================================
-- 7. RF-08: COBERTURA MINIMA DE GUARDIAS POR ACCESO
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_evaluar_cobertura_acceso(p_acceso_id bigint, p_fecha date)
RETURNS void
LANGUAGE plpgsql
SET search_path = transmetro, public
AS $$
DECLARE
    v_acceso    acceso%ROWTYPE;
    v_faltantes jsonb;
BEGIN
    SELECT * INTO v_acceso FROM acceso WHERE id = p_acceso_id;
    IF NOT FOUND OR v_acceso.estado <> 'habilitado' OR v_acceso.guardias_minimos = 0 THEN
        PERFORM fn_alerta_cerrar('cobertura_guardias', 'acceso', p_acceso_id);
        RETURN;
    END IF;

    -- Turnos activos cuya cobertura efectiva queda por debajo del minimo
    SELECT jsonb_agg(jsonb_build_object(
               'turno',      t.codigo,
               'asignados',  COALESCE(c.total, 0),
               'requeridos', v_acceso.guardias_minimos))
      INTO v_faltantes
      FROM turno t
      LEFT JOIN (
            SELECT turno_id, count(*) AS total
              FROM guardia_asignacion
             WHERE acceso_id = p_acceso_id
               AND fecha     = p_fecha
               AND estado IN ('programado', 'presente', 'cubierto')
             GROUP BY turno_id
      ) c ON c.turno_id = t.id
     WHERE t.activo
       AND COALESCE(c.total, 0) < v_acceso.guardias_minimos;

    IF v_faltantes IS NULL THEN
        PERFORM fn_alerta_cerrar('cobertura_guardias', 'acceso', p_acceso_id);
    ELSE
        PERFORM fn_alerta_abrir(
            'cobertura_guardias', 'critica', 'acceso', p_acceso_id,
            NULL, v_acceso.estacion_id,
            format('El acceso %s no alcanza la cobertura minima de %s guardia(s) el %s.',
                   v_acceso.nombre, v_acceso.guardias_minimos, p_fecha),
            jsonb_build_object('fecha', p_fecha, 'turnos_descubiertos', v_faltantes)
        );
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_tg_cobertura_guardias()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = transmetro, public
AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.fecha >= CURRENT_DATE THEN
        PERFORM fn_evaluar_cobertura_acceso(NEW.acceso_id, NEW.fecha);
    END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.fecha >= CURRENT_DATE THEN
        PERFORM fn_evaluar_cobertura_acceso(OLD.acceso_id, OLD.fecha);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER tg_cobertura_guardias
    AFTER INSERT OR UPDATE OR DELETE ON guardia_asignacion
    FOR EACH ROW EXECUTE FUNCTION fn_tg_cobertura_guardias();

-- ============================================================================
-- 8. RF-09: ALERTA DE SOBRECUPO
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_tg_sobrecupo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = transmetro, public
AS $$
DECLARE
    v_bus bus%ROWTYPE;
BEGIN
    IF NOT NEW.sobrecupo THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_bus FROM bus WHERE id = NEW.bus_id;

    PERFORM fn_alerta_abrir(
        'sobrecupo', 'critica', 'bus', NEW.bus_id,
        (SELECT linea_id FROM bus_linea_asignacion
          WHERE bus_id = NEW.bus_id AND fecha_fin IS NULL),
        NEW.estacion_id,
        format('Sobrecupo en la unidad %s: %s pasajeros para una capacidad de %s (%s %%).',
               v_bus.numero_economico, NEW.pasajeros_abordo,
               NEW.capacidad_referencia, NEW.porcentaje_ocupacion),
        jsonb_build_object('registro_id',  NEW.id,
                           'abordo',       NEW.pasajeros_abordo,
                           'capacidad',    NEW.capacidad_referencia,
                           'porcentaje',   NEW.porcentaje_ocupacion,
                           'umbral_pct',   150)
    );

    RETURN NULL;
END;
$$;

CREATE TRIGGER tg_sobrecupo
    AFTER INSERT ON registro_ocupacion
    FOR EACH ROW EXECUTE FUNCTION fn_tg_sobrecupo();

-- ============================================================================
-- 9. ENGANCHE DE TRAZABILIDAD Y AUDITORIA EN TABLAS CRITICAS
-- ============================================================================
CREATE TRIGGER tg_traza_linea          BEFORE INSERT OR UPDATE ON linea                FOR EACH ROW EXECUTE FUNCTION fn_set_trazabilidad();
CREATE TRIGGER tg_traza_estacion       BEFORE INSERT OR UPDATE ON estacion             FOR EACH ROW EXECUTE FUNCTION fn_set_trazabilidad();
CREATE TRIGGER tg_traza_linea_estacion BEFORE INSERT OR UPDATE ON linea_estacion       FOR EACH ROW EXECUTE FUNCTION fn_set_trazabilidad();
CREATE TRIGGER tg_traza_acceso         BEFORE INSERT OR UPDATE ON acceso               FOR EACH ROW EXECUTE FUNCTION fn_set_trazabilidad();
CREATE TRIGGER tg_traza_bus            BEFORE INSERT OR UPDATE ON bus                  FOR EACH ROW EXECUTE FUNCTION fn_set_trazabilidad();
CREATE TRIGGER tg_traza_persona        BEFORE INSERT OR UPDATE ON persona              FOR EACH ROW EXECUTE FUNCTION fn_set_trazabilidad();
CREATE TRIGGER tg_traza_usuario        BEFORE INSERT OR UPDATE ON usuario              FOR EACH ROW EXECUTE FUNCTION fn_set_trazabilidad();
CREATE TRIGGER tg_traza_municipalidad  BEFORE INSERT OR UPDATE ON municipalidad        FOR EACH ROW EXECUTE FUNCTION fn_set_trazabilidad();
CREATE TRIGGER tg_traza_equipo         BEFORE INSERT OR UPDATE ON equipo_computo       FOR EACH ROW EXECUTE FUNCTION fn_set_trazabilidad();

CREATE TRIGGER tg_audit_linea       AFTER INSERT OR UPDATE OR DELETE ON linea                FOR EACH ROW EXECUTE FUNCTION fn_auditoria('LINEAS_ESTACIONES');
CREATE TRIGGER tg_audit_estacion    AFTER INSERT OR UPDATE OR DELETE ON estacion             FOR EACH ROW EXECUTE FUNCTION fn_auditoria('LINEAS_ESTACIONES');
CREATE TRIGGER tg_audit_lin_est     AFTER INSERT OR UPDATE OR DELETE ON linea_estacion       FOR EACH ROW EXECUTE FUNCTION fn_auditoria('LINEAS_ESTACIONES');
CREATE TRIGGER tg_audit_acceso      AFTER INSERT OR UPDATE OR DELETE ON acceso               FOR EACH ROW EXECUTE FUNCTION fn_auditoria('LINEAS_ESTACIONES');
CREATE TRIGGER tg_audit_bus         AFTER INSERT OR UPDATE OR DELETE ON bus                  FOR EACH ROW EXECUTE FUNCTION fn_auditoria('FLOTA');
CREATE TRIGGER tg_audit_bus_linea   AFTER INSERT OR UPDATE OR DELETE ON bus_linea_asignacion FOR EACH ROW EXECUTE FUNCTION fn_auditoria('FLOTA');
CREATE TRIGGER tg_audit_parqueo     AFTER INSERT OR UPDATE OR DELETE ON parqueo_asignacion   FOR EACH ROW EXECUTE FUNCTION fn_auditoria('FLOTA');
CREATE TRIGGER tg_audit_persona     AFTER INSERT OR UPDATE OR DELETE ON persona              FOR EACH ROW EXECUTE FUNCTION fn_auditoria('PERSONAL');
CREATE TRIGGER tg_audit_piloto      AFTER INSERT OR UPDATE OR DELETE ON piloto               FOR EACH ROW EXECUTE FUNCTION fn_auditoria('PERSONAL');
CREATE TRIGGER tg_audit_guardia_asg AFTER INSERT OR UPDATE OR DELETE ON guardia_asignacion   FOR EACH ROW EXECUTE FUNCTION fn_auditoria('PERSONAL');
CREATE TRIGGER tg_audit_usuario     AFTER INSERT OR UPDATE OR DELETE ON usuario              FOR EACH ROW EXECUTE FUNCTION fn_auditoria('SEGURIDAD');
CREATE TRIGGER tg_audit_usuario_rol AFTER INSERT OR UPDATE OR DELETE ON usuario_rol          FOR EACH ROW EXECUTE FUNCTION fn_auditoria('SEGURIDAD');
CREATE TRIGGER tg_audit_rol_permiso AFTER INSERT OR UPDATE OR DELETE ON rol_permiso          FOR EACH ROW EXECUTE FUNCTION fn_auditoria('SEGURIDAD');
CREATE TRIGGER tg_audit_conciliacion AFTER INSERT OR UPDATE OR DELETE ON conciliacion        FOR EACH ROW EXECUTE FUNCTION fn_auditoria('PAGOS');

\echo '>>> 08 Reglas de negocio y auditoria creadas'
