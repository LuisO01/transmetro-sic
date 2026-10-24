-- =============================================================================
-- SIC Transmetro | 06_tablas_operacion.sql
-- Viajes/despachos, ocupacion, alertas, equipo de computo y conectividad.
-- Cubre RF-09, RF-10, RF-11 y el soporte de RF-05/RF-06/RF-08 (alertas).
-- =============================================================================

SET search_path = transmetro, public;

-- ----------------------------------------------------------------------------
-- ALERTA  (bandeja unica de excepciones operativas)
-- ----------------------------------------------------------------------------
CREATE TABLE alerta (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo          tipo_alerta      NOT NULL,
    severidad     severidad_alerta NOT NULL DEFAULT 'advertencia',
    estado        estado_alerta    NOT NULL DEFAULT 'abierta',
    entidad_tabla varchar(63),
    entidad_id    bigint,
    linea_id      bigint           REFERENCES linea(id),
    estacion_id   bigint           REFERENCES estacion(id),
    mensaje       varchar(500)     NOT NULL,
    detalle       jsonb,
    generada_en   timestamptz      NOT NULL DEFAULT now(),
    atendida_en   timestamptz,
    atendida_por  bigint           REFERENCES usuario(id),
    nota_atencion varchar(500),

    CONSTRAINT ck_alerta_cierre CHECK (
        (estado = 'cerrada' AND atendida_en IS NOT NULL)
        OR estado <> 'cerrada'
    )
);

-- Una sola alerta abierta por tipo y entidad: evita inundar la bandeja
CREATE UNIQUE INDEX ux_alerta_abierta_unica
    ON alerta (tipo, entidad_tabla, entidad_id)
    WHERE estado <> 'cerrada';

COMMENT ON TABLE alerta IS
    'Alertas automaticas generadas por los triggers de reglas de negocio '
    '(RF-05 rango de unidades, RF-06 bus sin parqueo, RF-08 cobertura, RF-09 sobrecupo).';

-- ----------------------------------------------------------------------------
-- VIAJE  (despacho desde anden - RF-10)
-- ----------------------------------------------------------------------------
CREATE TABLE viaje (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bus_id               bigint            NOT NULL REFERENCES bus(id),
    linea_id             bigint            NOT NULL REFERENCES linea(id),
    piloto_id            bigint            REFERENCES piloto(persona_id),
    estacion_origen_id   bigint            NOT NULL REFERENCES estacion(id),
    sentido              sentido_recorrido NOT NULL DEFAULT 'ida',
    fecha_hora_llegada   timestamptz       NOT NULL,
    fecha_hora_salida    timestamptz,
    ocupacion_salida_pct numeric(6,2),
    estado               estado_viaje      NOT NULL DEFAULT 'en_anden',
    observaciones        varchar(250),
    creado_en            timestamptz       NOT NULL DEFAULT now(),
    registrado_por       bigint            REFERENCES usuario(id),

    CONSTRAINT ck_viaje_secuencia CHECK (
        fecha_hora_salida IS NULL OR fecha_hora_salida >= fecha_hora_llegada
    ),
    CONSTRAINT ck_viaje_ocupacion CHECK (
        ocupacion_salida_pct IS NULL OR ocupacion_salida_pct >= 0
    ),

    -- ---------------------------------------------------------------------
    -- REGLA DE NEGOCIO RF-10: una unidad con menos del 25 % de ocupacion
    -- debe permanecer al menos 5 minutos en el anden antes de ser despachada.
    -- Es una restriccion intra-tupla, por lo que se resuelve con CHECK y no
    -- requiere trigger.
    -- ---------------------------------------------------------------------
    CONSTRAINT ck_viaje_espera_minima CHECK (
        fecha_hora_salida IS NULL
        OR ocupacion_salida_pct IS NULL
        OR ocupacion_salida_pct >= 25
        OR (fecha_hora_salida - fecha_hora_llegada) >= INTERVAL '5 minutes'
    )
);

COMMENT ON CONSTRAINT ck_viaje_espera_minima ON viaje IS
    'RF-10: regla de espera de 5 minutos para unidades con ocupacion menor al 25 %.';

-- Un bus no puede tener dos viajes abiertos en anden simultaneamente
CREATE UNIQUE INDEX ux_viaje_bus_en_anden
    ON viaje (bus_id)
    WHERE estado = 'en_anden';

-- ----------------------------------------------------------------------------
-- REGISTRO_OCUPACION  (RF-09)
-- ----------------------------------------------------------------------------
CREATE TABLE registro_ocupacion (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    viaje_id             bigint      REFERENCES viaje(id) ON DELETE CASCADE,
    bus_id               bigint      NOT NULL REFERENCES bus(id),
    estacion_id          bigint      NOT NULL REFERENCES estacion(id),
    fecha_hora           timestamptz NOT NULL DEFAULT now(),
    pasajeros_abordo     integer     NOT NULL,
    pasajeros_suben      integer     NOT NULL DEFAULT 0,
    pasajeros_bajan      integer     NOT NULL DEFAULT 0,
    -- Copia de la capacidad vigente del bus: conserva el calculo historico
    -- aunque despues se reconfigure la unidad.
    capacidad_referencia integer     NOT NULL,

    porcentaje_ocupacion numeric(6,2) GENERATED ALWAYS AS (
        round(pasajeros_abordo * 100.0 / capacidad_referencia, 2)
    ) STORED,

    -- RF-09: sobrecupo cuando se supera en 50 % la capacidad nominal
    sobrecupo            boolean GENERATED ALWAYS AS (
        pasajeros_abordo > capacidad_referencia * 1.5
    ) STORED,

    registrado_por       bigint      REFERENCES usuario(id),

    CONSTRAINT ck_ocupacion_abordo    CHECK (pasajeros_abordo >= 0),
    CONSTRAINT ck_ocupacion_suben     CHECK (pasajeros_suben  >= 0),
    CONSTRAINT ck_ocupacion_bajan     CHECK (pasajeros_bajan  >= 0),
    CONSTRAINT ck_ocupacion_capacidad CHECK (capacidad_referencia > 0)
);

COMMENT ON COLUMN registro_ocupacion.sobrecupo IS
    'RF-09: verdadero cuando los pasajeros a bordo exceden el 150 % de la capacidad nominal.';

-- ----------------------------------------------------------------------------
-- EQUIPO_COMPUTO  (RF-11)
-- ----------------------------------------------------------------------------
CREATE TABLE equipo_computo (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estacion_id          bigint        NOT NULL REFERENCES estacion(id) ON DELETE CASCADE,
    tipo                 tipo_equipo   NOT NULL,
    marca                varchar(60),
    modelo               varchar(60),
    numero_serie         varchar(60)   NOT NULL,
    direccion_ip         inet,
    fecha_instalacion    date,
    ultimo_mantenimiento date,
    estado               estado_equipo NOT NULL DEFAULT 'operativo',
    observaciones        varchar(250),
    creado_en            timestamptz   NOT NULL DEFAULT now(),
    creado_por           bigint        REFERENCES usuario(id),
    actualizado_en       timestamptz,
    actualizado_por      bigint        REFERENCES usuario(id),

    CONSTRAINT uq_equipo_serie UNIQUE (numero_serie)
);

-- ----------------------------------------------------------------------------
-- REGISTRO_CONECTIVIDAD  (RF-11)
-- ----------------------------------------------------------------------------
CREATE TABLE registro_conectividad (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estacion_id      bigint        NOT NULL REFERENCES estacion(id) ON DELETE CASCADE,
    equipo_id        bigint        REFERENCES equipo_computo(id) ON DELETE SET NULL,
    fecha_hora       timestamptz   NOT NULL DEFAULT now(),
    estado_enlace    estado_enlace NOT NULL,
    latencia_ms      integer,
    ancho_banda_mbps numeric(7,2),
    observacion      varchar(250),
    registrado_por   bigint        REFERENCES usuario(id),

    CONSTRAINT ck_conectividad_latencia CHECK (latencia_ms IS NULL OR latencia_ms >= 0),
    CONSTRAINT ck_conectividad_ancho    CHECK (ancho_banda_mbps IS NULL OR ancho_banda_mbps >= 0)
);

\echo '>>> 06 Tablas de operacion creadas'
