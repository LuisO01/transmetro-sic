-- =============================================================================
-- SIC Transmetro | 04_tablas_flota.sql
-- Unidades, asignacion a linea y parqueos.
-- Cubre RF-04, RF-05 (datos) y RF-06.
-- =============================================================================

SET search_path = transmetro, public;

-- ----------------------------------------------------------------------------
-- BUS
-- ----------------------------------------------------------------------------
CREATE TABLE bus (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    placa              varchar(10) NOT NULL,
    numero_economico   varchar(10) NOT NULL,
    municipalidad_id   bigint      NOT NULL REFERENCES municipalidad(id),
    tipo               tipo_bus    NOT NULL DEFAULT 'articulado',
    marca              varchar(60),
    modelo             varchar(60),
    anio               smallint,
    capacidad_sentados smallint    NOT NULL,
    capacidad_pie      smallint    NOT NULL DEFAULT 0,
    capacidad_total    integer     GENERATED ALWAYS AS (capacidad_sentados + capacidad_pie) STORED,
    estado             estado_bus  NOT NULL DEFAULT 'operativo',
    fecha_alta         date        NOT NULL DEFAULT CURRENT_DATE,
    observaciones      varchar(250),
    creado_en          timestamptz NOT NULL DEFAULT now(),
    creado_por         bigint      REFERENCES usuario(id),
    actualizado_en     timestamptz,
    actualizado_por    bigint      REFERENCES usuario(id),

    CONSTRAINT uq_bus_placa      UNIQUE (placa),
    CONSTRAINT uq_bus_economico  UNIQUE (numero_economico),
    CONSTRAINT ck_bus_anio       CHECK (anio IS NULL OR anio BETWEEN 1980 AND 2100),
    CONSTRAINT ck_bus_sentados   CHECK (capacidad_sentados > 0),
    CONSTRAINT ck_bus_pie        CHECK (capacidad_pie >= 0)
);

COMMENT ON COLUMN bus.capacidad_total IS
    'Capacidad nominal = sentados + de pie. Base del calculo de sobrecupo del 50 % (RF-09).';

-- ----------------------------------------------------------------------------
-- BUS_LINEA_ASIGNACION  (RF-04)
-- Historico de asignaciones. La vigente es la que tiene fecha_fin NULL.
-- ----------------------------------------------------------------------------
CREATE TABLE bus_linea_asignacion (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bus_id         bigint      NOT NULL REFERENCES bus(id)   ON DELETE CASCADE,
    linea_id       bigint      NOT NULL REFERENCES linea(id) ON DELETE RESTRICT,
    fecha_inicio   timestamptz NOT NULL DEFAULT now(),
    fecha_fin      timestamptz,
    motivo         varchar(250),
    creado_en      timestamptz NOT NULL DEFAULT now(),
    creado_por     bigint      REFERENCES usuario(id),
    finalizado_por bigint      REFERENCES usuario(id),

    CONSTRAINT ck_bus_asig_fechas CHECK (fecha_fin IS NULL OR fecha_fin > fecha_inicio),

    -- ---------------------------------------------------------------------
    -- REGLA DE NEGOCIO RF-04: un bus solo puede estar activo en UNA linea.
    -- El EXCLUDE impide ademas cualquier solapamiento historico: dos periodos
    -- de asignacion del mismo bus no pueden intersectarse.
    -- Requiere la extension btree_gist para combinar '=' sobre bigint con
    -- '&&' sobre rangos de tiempo.
    -- ---------------------------------------------------------------------
    CONSTRAINT ex_bus_una_linea_a_la_vez EXCLUDE USING gist (
        bus_id                                       WITH =,
        tstzrange(fecha_inicio, fecha_fin, '[)')     WITH &&
    )
);

-- Guarda redundante y barata: a lo sumo una asignacion vigente por bus.
-- Produce un mensaje de error mas claro que el EXCLUDE en el caso mas comun.
CREATE UNIQUE INDEX ux_bus_asignacion_vigente
    ON bus_linea_asignacion (bus_id)
    WHERE fecha_fin IS NULL;

COMMENT ON CONSTRAINT ex_bus_una_linea_a_la_vez ON bus_linea_asignacion IS
    'RF-04: impide que un bus este asignado a dos lineas en periodos que se solapen.';

-- ----------------------------------------------------------------------------
-- PARQUEO  (RF-06)
-- ----------------------------------------------------------------------------
CREATE TABLE parqueo_predio (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo           varchar(15)  NOT NULL,
    nombre           varchar(120) NOT NULL,
    municipalidad_id bigint       NOT NULL REFERENCES municipalidad(id),
    direccion        varchar(250),
    capacidad        integer      NOT NULL,
    activo           boolean      NOT NULL DEFAULT true,
    creado_en        timestamptz  NOT NULL DEFAULT now(),
    creado_por       bigint       REFERENCES usuario(id),

    CONSTRAINT uq_predio_codigo   UNIQUE (codigo),
    CONSTRAINT ck_predio_capacidad CHECK (capacidad > 0)
);

CREATE TABLE parqueo_espacio (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    predio_id       bigint         NOT NULL REFERENCES parqueo_predio(id) ON DELETE CASCADE,
    codigo          varchar(15)    NOT NULL,
    tipo_permitido  tipo_bus,
    estado          estado_espacio NOT NULL DEFAULT 'disponible',
    observaciones   varchar(250),

    CONSTRAINT uq_espacio_codigo UNIQUE (predio_id, codigo)
);

COMMENT ON COLUMN parqueo_espacio.tipo_permitido IS
    'NULL = admite cualquier tipo de unidad. Si se especifica, debe coincidir con bus.tipo.';

CREATE TABLE parqueo_asignacion (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    espacio_id   bigint      NOT NULL REFERENCES parqueo_espacio(id) ON DELETE RESTRICT,
    bus_id       bigint      NOT NULL REFERENCES bus(id)             ON DELETE CASCADE,
    fecha_inicio timestamptz NOT NULL DEFAULT now(),
    fecha_fin    timestamptz,
    motivo       varchar(250),
    creado_en    timestamptz NOT NULL DEFAULT now(),
    creado_por   bigint      REFERENCES usuario(id),

    CONSTRAINT ck_parqueo_fechas CHECK (fecha_fin IS NULL OR fecha_fin > fecha_inicio),

    -- RF-06: un espacio no puede alojar dos buses al mismo tiempo
    CONSTRAINT ex_espacio_un_bus EXCLUDE USING gist (
        espacio_id                               WITH =,
        tstzrange(fecha_inicio, fecha_fin, '[)') WITH &&
    ),
    -- RF-06: un bus no puede ocupar dos espacios al mismo tiempo
    CONSTRAINT ex_bus_un_espacio EXCLUDE USING gist (
        bus_id                                   WITH =,
        tstzrange(fecha_inicio, fecha_fin, '[)') WITH &&
    )
);

COMMENT ON TABLE parqueo_asignacion IS
    'RF-06: ningun bus operativo puede quedar sin parqueo. La excepcion se detecta '
    'con la vista v_buses_sin_parqueo y genera alerta automatica.';

\echo '>>> 04 Tablas de flota creadas'
