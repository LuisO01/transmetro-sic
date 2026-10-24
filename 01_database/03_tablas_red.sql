-- =============================================================================
-- SIC Transmetro | 03_tablas_red.sql
-- Lineas, estaciones, recorrido (M:N) y accesos.
-- Cubre RF-01, RF-02, RF-03 y RF-13.
-- =============================================================================

SET search_path = transmetro, public;

-- ----------------------------------------------------------------------------
-- LINEA  (RF-01, RF-05, RF-13)
-- ----------------------------------------------------------------------------
CREATE TABLE linea (
    id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo                 varchar(10)  NOT NULL,
    nombre                 varchar(120) NOT NULL,
    color_hex              char(7)      NOT NULL DEFAULT '#0057B8',
    tipo                   tipo_linea   NOT NULL DEFAULT 'troncal',
    municipalidad_id       bigint       NOT NULL REFERENCES municipalidad(id),
    unidades_minimas       smallint     NOT NULL,
    unidades_maximas       smallint     NOT NULL,
    estado                 estado_linea NOT NULL DEFAULT 'planificada',
    fecha_inicio_operacion date,
    -- Parametros de servicio al publico (tarifa en quetzales y horario)
    tarifa                 numeric(5,2) NOT NULL DEFAULT 1.00,
    hora_inicio            time         NOT NULL DEFAULT '04:30',
    hora_fin               time         NOT NULL DEFAULT '21:30',
    frecuencia_pico_min    smallint     NOT NULL DEFAULT 8,
    frecuencia_valle_min   smallint     NOT NULL DEFAULT 15,
    observaciones          varchar(500),
    creado_en              timestamptz  NOT NULL DEFAULT now(),
    creado_por             bigint       REFERENCES usuario(id),
    actualizado_en         timestamptz,
    actualizado_por        bigint       REFERENCES usuario(id),

    CONSTRAINT uq_linea_codigo  UNIQUE (codigo),
    CONSTRAINT uq_linea_nombre  UNIQUE (nombre),
    CONSTRAINT ck_linea_color   CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT ck_linea_min     CHECK (unidades_minimas >= 1),
    -- RF-05: el rango operativo debe ser coherente
    CONSTRAINT ck_linea_rango   CHECK (unidades_maximas >= unidades_minimas),
    CONSTRAINT ck_linea_tarifa  CHECK (tarifa > 0),
    CONSTRAINT ck_linea_horario CHECK (hora_fin > hora_inicio),
    CONSTRAINT ck_linea_frecuencias CHECK (
        frecuencia_pico_min > 0 AND frecuencia_valle_min >= frecuencia_pico_min
    )
);

COMMENT ON COLUMN linea.unidades_minimas IS
    'Minimo de unidades asignadas para que la linea opere con normalidad (RF-05).';
COMMENT ON TABLE linea IS
    'La longitud total NO se almacena: se deriva en la vista v_linea_longitud (RF-02).';

-- ----------------------------------------------------------------------------
-- ESTACION  (RF-01, RF-13)
-- ----------------------------------------------------------------------------
CREATE TABLE estacion (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo               varchar(15)     NOT NULL,
    nombre               varchar(150)    NOT NULL,
    municipalidad_id     bigint          NOT NULL REFERENCES municipalidad(id),
    tipo                 tipo_estacion   NOT NULL DEFAULT 'troncal',
    latitud              numeric(9,6),
    longitud             numeric(10,6),
    capacidad_personas   integer         NOT NULL DEFAULT 100,
    direccion_referencia varchar(250),
    estado               estado_estacion NOT NULL DEFAULT 'operativa',
    creado_en            timestamptz     NOT NULL DEFAULT now(),
    creado_por           bigint          REFERENCES usuario(id),
    actualizado_en       timestamptz,
    actualizado_por      bigint          REFERENCES usuario(id),

    CONSTRAINT uq_estacion_codigo   UNIQUE (codigo),
    CONSTRAINT ck_estacion_capacidad CHECK (capacidad_personas > 0),
    -- Encierro geografico aproximado del territorio guatemalteco
    CONSTRAINT ck_estacion_latitud  CHECK (latitud  IS NULL OR latitud  BETWEEN 13.0 AND 18.0),
    CONSTRAINT ck_estacion_longitud CHECK (longitud IS NULL OR longitud BETWEEN -93.0 AND -88.0),
    CONSTRAINT ck_estacion_coords   CHECK ((latitud IS NULL) = (longitud IS NULL))
);

-- El ambito del Operador de estacion ya puede referenciarse
ALTER TABLE usuario
    ADD CONSTRAINT fk_usuario_estacion FOREIGN KEY (estacion_id) REFERENCES estacion(id);

-- ----------------------------------------------------------------------------
-- LINEA_ESTACION  (M:N con orden de recorrido y distancia - RF-01, RF-02)
-- ----------------------------------------------------------------------------
CREATE TABLE linea_estacion (
    id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    linea_id               bigint            NOT NULL REFERENCES linea(id)    ON DELETE CASCADE,
    estacion_id            bigint            NOT NULL REFERENCES estacion(id) ON DELETE RESTRICT,
    sentido                sentido_recorrido NOT NULL DEFAULT 'ida',
    orden_recorrido        smallint          NOT NULL,
    distancia_km_siguiente numeric(6,3),
    tiempo_estimado_min    smallint,
    activo                 boolean           NOT NULL DEFAULT true,
    creado_en              timestamptz       NOT NULL DEFAULT now(),
    creado_por             bigint            REFERENCES usuario(id),
    actualizado_en         timestamptz,
    actualizado_por        bigint            REFERENCES usuario(id),

    -- Una estacion no se repite en el mismo sentido de la misma linea
    CONSTRAINT uq_linea_estacion_par   UNIQUE (linea_id, estacion_id, sentido),
    -- El orden del recorrido es unico y consecutivo por sentido
    CONSTRAINT uq_linea_estacion_orden UNIQUE (linea_id, sentido, orden_recorrido),
    CONSTRAINT ck_linea_estacion_orden CHECK (orden_recorrido >= 1),
    CONSTRAINT ck_linea_estacion_dist  CHECK (distancia_km_siguiente IS NULL OR distancia_km_siguiente > 0),
    CONSTRAINT ck_linea_estacion_tiempo CHECK (tiempo_estimado_min IS NULL OR tiempo_estimado_min > 0)
);

COMMENT ON COLUMN linea_estacion.distancia_km_siguiente IS
    'Distancia hasta la siguiente estacion del recorrido. NULL en la estacion terminal (RF-02).';

-- ----------------------------------------------------------------------------
-- ACCESO  (RF-03, RF-08)
-- ----------------------------------------------------------------------------
CREATE TABLE acceso (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estacion_id      bigint        NOT NULL REFERENCES estacion(id) ON DELETE CASCADE,
    codigo           varchar(20)   NOT NULL,
    nombre           varchar(120)  NOT NULL,
    tipo             tipo_acceso   NOT NULL DEFAULT 'peatonal',
    torniquetes      smallint      NOT NULL DEFAULT 0,
    guardias_minimos smallint      NOT NULL DEFAULT 1,
    estado           estado_acceso NOT NULL DEFAULT 'habilitado',
    observaciones    varchar(250),
    creado_en        timestamptz   NOT NULL DEFAULT now(),
    creado_por       bigint        REFERENCES usuario(id),
    actualizado_en   timestamptz,
    actualizado_por  bigint        REFERENCES usuario(id),

    CONSTRAINT uq_acceso_codigo    UNIQUE (estacion_id, codigo),
    CONSTRAINT ck_acceso_torniquetes CHECK (torniquetes >= 0),
    CONSTRAINT ck_acceso_guardias  CHECK (guardias_minimos >= 0)
);

COMMENT ON COLUMN acceso.guardias_minimos IS
    'Cobertura minima de guardias exigida por turno para este acceso (RF-08).';

-- ----------------------------------------------------------------------------
-- PARAMETRO_SISTEMA
-- Valores de operacion que cambian por decision administrativa y no deben
-- quedar escritos en el codigo: ventana de transbordo, costo de la tarjeta,
-- umbrales de las alertas.
-- ----------------------------------------------------------------------------
CREATE TABLE parametro_sistema (
    clave           varchar(40)  PRIMARY KEY,
    valor           varchar(100) NOT NULL,
    unidad          varchar(20),
    descripcion     varchar(250) NOT NULL,
    actualizado_en  timestamptz,
    actualizado_por bigint REFERENCES usuario(id)
);

COMMENT ON TABLE parametro_sistema IS
    'Parametros de operacion editables por el administrador general.';

\echo '>>> 03 Tablas de red creadas'
