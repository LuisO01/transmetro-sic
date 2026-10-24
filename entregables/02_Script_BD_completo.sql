-- =============================================================================
-- SIC TRANSMETRO - Sistema de Informacion y Control del Transmetro
-- Script completo de base de datos (PostgreSQL 14 o superior)
--
-- Contenido, en orden de ejecucion:
--   00_drop_all.sql
--   01_extensiones_dominios.sql
--   02_tablas_seguridad.sql
--   03_tablas_red.sql
--   04_tablas_flota.sql
--   05_tablas_personal.sql
--   06_tablas_operacion.sql
--   07_tablas_pagos.sql
--   08_reglas_negocio.sql
--   09_indices.sql
--   10_vistas.sql
--   11_seed.sql
--
-- Ejecucion:
--   psql "postgresql://usuario:clave@host:5432/base" -v ON_ERROR_STOP=1 -f 02_Script_BD_completo.sql
--   o abrir en pgAdmin / DBeaver y ejecutar completo.
--
-- El script es re-ejecutable: la primera seccion elimina el esquema transmetro.
-- Contrasena de los usuarios de ejemplo: Transmetro2026*
-- Verificado ejecutandolo completo sobre PostgreSQL 18.3 (PGlite 0.5.8) el 2026-10-19.
-- =============================================================================


-- #############################################################################
-- ## 00_drop_all.sql
-- #############################################################################

-- =============================================================================
-- SIC Transmetro | 00_drop_all.sql
-- Elimina por completo el esquema de la aplicacion.
-- USO EXCLUSIVO EN AMBIENTES DE DESARROLLO / PRUEBAS.
-- =============================================================================
-- Ejecutar:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 01_database/00_drop_all.sql
-- =============================================================================

\echo '>>> ADVERTENCIA: se eliminara el esquema transmetro y TODOS sus datos'

DROP SCHEMA IF EXISTS transmetro CASCADE;

-- Las extensiones se dejan instaladas: son compartidas y su recreacion
-- requiere privilegios de superusuario en varios servicios administrados.

\echo '>>> Esquema transmetro eliminado'


-- #############################################################################
-- ## 01_extensiones_dominios.sql
-- #############################################################################

-- =============================================================================
-- SIC Transmetro | 01_extensiones_dominios.sql
-- Esquema, extensiones y tipos enumerados (dominios cerrados).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS transmetro;

-- btree_gist: necesaria para las restricciones EXCLUDE que combinan igualdad
--             sobre bigint con solapamiento de rangos de tiempo (RF-04, RF-06).
-- citext    : comparacion de usuario/correo sin distinguir mayusculas.
-- pgcrypto  : gen_random_uuid() y digest() para hash de tarjetas (RF-12).
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

SET search_path = transmetro, public;

-- ----------------------------------------------------------------------------
-- Red: lineas, estaciones, accesos
-- ----------------------------------------------------------------------------
CREATE TYPE tipo_linea       AS ENUM ('troncal', 'alimentadora', 'expres');
CREATE TYPE estado_linea     AS ENUM ('planificada', 'activa', 'suspendida', 'baja');
CREATE TYPE tipo_estacion    AS ENUM ('troncal', 'transferencia', 'terminal', 'parada');
CREATE TYPE estado_estacion  AS ENUM ('operativa', 'mantenimiento', 'cerrada');
CREATE TYPE sentido_recorrido AS ENUM ('ida', 'vuelta');
CREATE TYPE tipo_acceso      AS ENUM ('peatonal', 'pasarela', 'rampa', 'vehicular', 'emergencia');
CREATE TYPE estado_acceso    AS ENUM ('habilitado', 'cerrado', 'mantenimiento');

-- ----------------------------------------------------------------------------
-- Flota
-- ----------------------------------------------------------------------------
CREATE TYPE tipo_bus         AS ENUM ('articulado', 'biarticulado', 'padron', 'alimentador');
CREATE TYPE estado_bus       AS ENUM ('operativo', 'mantenimiento', 'fuera_servicio', 'baja');
CREATE TYPE estado_espacio   AS ENUM ('disponible', 'ocupado', 'inhabilitado');

-- ----------------------------------------------------------------------------
-- Personal
-- ----------------------------------------------------------------------------
CREATE TYPE tipo_licencia    AS ENUM ('A', 'B', 'C', 'M', 'E');
CREATE TYPE estado_personal  AS ENUM ('activo', 'suspendido', 'vacaciones', 'baja');
CREATE TYPE nivel_educativo  AS ENUM ('primaria', 'basicos', 'diversificado', 'tecnico', 'universidad', 'postgrado');
CREATE TYPE estado_cobertura AS ENUM ('programado', 'presente', 'ausente', 'cubierto');

-- ----------------------------------------------------------------------------
-- Operacion
-- ----------------------------------------------------------------------------
CREATE TYPE estado_viaje     AS ENUM ('en_anden', 'despachado', 'cancelado');
CREATE TYPE tipo_alerta      AS ENUM (
    'rango_unidades',        -- RF-05
    'sobrecupo',             -- RF-09
    'bus_sin_parqueo',       -- RF-06
    'cobertura_guardias',    -- RF-08
    'espera_incumplida',     -- RF-10
    'conectividad',          -- RF-11
    'descuadre_conciliacion' -- RF-12
);
CREATE TYPE severidad_alerta AS ENUM ('info', 'advertencia', 'critica');
CREATE TYPE estado_alerta    AS ENUM ('abierta', 'en_revision', 'cerrada');

-- ----------------------------------------------------------------------------
-- Tecnica
-- ----------------------------------------------------------------------------
CREATE TYPE tipo_equipo      AS ENUM ('pc', 'terminal_pago', 'torniquete', 'router', 'switch', 'camara', 'ups');
CREATE TYPE estado_equipo    AS ENUM ('operativo', 'intermitente', 'fuera_servicio', 'baja');
CREATE TYPE estado_enlace    AS ENUM ('en_linea', 'degradado', 'caido');

-- ----------------------------------------------------------------------------
-- Pagos
-- ----------------------------------------------------------------------------
CREATE TYPE tipo_tarjeta     AS ENUM ('ordinaria', 'estudiante', 'tercera_edad', 'cortesia');
CREATE TYPE estado_tarjeta   AS ENUM ('activa', 'bloqueada', 'vencida');
CREATE TYPE tipo_transaccion AS ENUM ('abordaje', 'recarga', 'reverso');
CREATE TYPE estado_transaccion AS ENUM ('aplicada', 'rechazada', 'pendiente');
CREATE TYPE estado_conciliacion AS ENUM ('cuadrada', 'descuadrada', 'ajustada');

-- ----------------------------------------------------------------------------
-- Seguridad
-- ----------------------------------------------------------------------------
-- L = lectura, E = escritura en su ambito, A = administracion total.
-- La ausencia de fila en rol_permiso equivale a "sin acceso".
CREATE TYPE nivel_permiso    AS ENUM ('L', 'E', 'A');
CREATE TYPE ambito_rol       AS ENUM ('propio', 'estacion', 'municipal', 'global');
CREATE TYPE estado_usuario   AS ENUM ('activo', 'bloqueado', 'inactivo');
CREATE TYPE accion_auditoria AS ENUM (
    'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGIN_FALLIDO', 'LOGOUT', 'EXPORT'
);
CREATE TYPE clasificacion_info AS ENUM ('publica', 'confidencial', 'reservada');

\echo '>>> 01 Extensiones y dominios creados'


-- #############################################################################
-- ## 02_tablas_seguridad.sql
-- #############################################################################

-- =============================================================================
-- SIC Transmetro | 02_tablas_seguridad.sql
-- Municipalidades, roles, modulos, matriz de permisos, usuarios y auditoria.
-- Cubre RF-13 (parcial), RF-15 y RF-16.
-- =============================================================================

SET search_path = transmetro, public;

-- ----------------------------------------------------------------------------
-- MUNICIPALIDAD  (RF-13)
-- ----------------------------------------------------------------------------
CREATE TABLE municipalidad (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo              varchar(10)  NOT NULL,
    nombre              varchar(120) NOT NULL,
    departamento        varchar(60)  NOT NULL DEFAULT 'Guatemala',
    nit                 varchar(15),
    telefono            varchar(20),
    correo_contacto     citext,
    direccion           varchar(250),
    activo              boolean      NOT NULL DEFAULT true,
    creado_en           timestamptz  NOT NULL DEFAULT now(),
    creado_por          bigint,
    actualizado_en      timestamptz,
    actualizado_por     bigint,

    CONSTRAINT uq_municipalidad_codigo UNIQUE (codigo),
    CONSTRAINT uq_municipalidad_nombre UNIQUE (nombre),
    CONSTRAINT ck_municipalidad_codigo CHECK (codigo = upper(codigo))
);

COMMENT ON TABLE municipalidad IS
    'Municipalidades que administran lineas, estaciones y flota (RF-13).';

-- ----------------------------------------------------------------------------
-- MODULO  (unidades protegidas de la matriz de permisos)
-- ----------------------------------------------------------------------------
CREATE TABLE modulo (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      varchar(40)  NOT NULL,
    nombre      varchar(120) NOT NULL,
    descripcion varchar(250),
    orden       smallint     NOT NULL DEFAULT 0,

    CONSTRAINT uq_modulo_codigo UNIQUE (codigo)
);

-- ----------------------------------------------------------------------------
-- ROL
-- ----------------------------------------------------------------------------
CREATE TABLE rol (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      varchar(40)  NOT NULL,
    nombre      varchar(120) NOT NULL,
    descripcion varchar(250),
    ambito      ambito_rol   NOT NULL,
    activo      boolean      NOT NULL DEFAULT true,

    CONSTRAINT uq_rol_codigo UNIQUE (codigo)
);

COMMENT ON COLUMN rol.ambito IS
    'Alcance de los datos que el rol puede tocar: propio, estacion, municipal o global.';

-- ----------------------------------------------------------------------------
-- ROL_PERMISO  (la matriz de permisos, normalizada)
-- ----------------------------------------------------------------------------
CREATE TABLE rol_permiso (
    rol_id     bigint        NOT NULL REFERENCES rol(id)    ON DELETE CASCADE,
    modulo_id  bigint        NOT NULL REFERENCES modulo(id) ON DELETE CASCADE,
    nivel      nivel_permiso NOT NULL,

    CONSTRAINT pk_rol_permiso PRIMARY KEY (rol_id, modulo_id)
);

COMMENT ON TABLE rol_permiso IS
    'Matriz rol x modulo. La ausencia de fila significa "sin acceso" (RF-15).';

-- ----------------------------------------------------------------------------
-- USUARIO  (RF-15)
-- ----------------------------------------------------------------------------
CREATE TABLE usuario (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username                citext        NOT NULL,
    correo                  citext        NOT NULL,
    password_hash           varchar(72)   NOT NULL,
    nombre_completo         varchar(150)  NOT NULL,
    persona_id              bigint,          -- FK agregada en 05_tablas_personal.sql
    municipalidad_id        bigint          REFERENCES municipalidad(id),
    estacion_id             bigint,          -- FK agregada en 03_tablas_red.sql
    estado                  estado_usuario NOT NULL DEFAULT 'activo',
    debe_cambiar_password   boolean       NOT NULL DEFAULT true,
    intentos_fallidos       smallint      NOT NULL DEFAULT 0,
    bloqueado_hasta         timestamptz,
    ultimo_acceso           timestamptz,
    creado_en               timestamptz   NOT NULL DEFAULT now(),
    creado_por              bigint,
    actualizado_en          timestamptz,
    actualizado_por         bigint,

    CONSTRAINT uq_usuario_username UNIQUE (username),
    CONSTRAINT uq_usuario_correo   UNIQUE (correo),
    CONSTRAINT ck_usuario_username CHECK (length(username) BETWEEN 4 AND 40),
    CONSTRAINT ck_usuario_correo   CHECK (correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$'),
    CONSTRAINT ck_usuario_intentos CHECK (intentos_fallidos >= 0)
);

COMMENT ON COLUMN usuario.password_hash IS
    'bcrypt con factor de coste 12. Nunca se almacena la contrasena en claro (RNF seguridad).';
COMMENT ON COLUMN usuario.estacion_id IS
    'Estacion asignada al Operador de estacion; define su ambito de escritura.';

-- FKs de auditoria que no podian declararse antes de existir usuario
ALTER TABLE municipalidad
    ADD CONSTRAINT fk_municipalidad_creado_por      FOREIGN KEY (creado_por)      REFERENCES usuario(id),
    ADD CONSTRAINT fk_municipalidad_actualizado_por FOREIGN KEY (actualizado_por) REFERENCES usuario(id);

ALTER TABLE usuario
    ADD CONSTRAINT fk_usuario_creado_por      FOREIGN KEY (creado_por)      REFERENCES usuario(id),
    ADD CONSTRAINT fk_usuario_actualizado_por FOREIGN KEY (actualizado_por) REFERENCES usuario(id);

-- ----------------------------------------------------------------------------
-- USUARIO_ROL  (M:N)
-- ----------------------------------------------------------------------------
CREATE TABLE usuario_rol (
    usuario_id   bigint      NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    rol_id       bigint      NOT NULL REFERENCES rol(id),
    asignado_en  timestamptz NOT NULL DEFAULT now(),
    asignado_por bigint      REFERENCES usuario(id),

    CONSTRAINT pk_usuario_rol PRIMARY KEY (usuario_id, rol_id)
);

-- ----------------------------------------------------------------------------
-- SESION_REFRESH  (rotacion de refresh tokens y cierre de sesion real)
-- ----------------------------------------------------------------------------
CREATE TABLE sesion_refresh (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id   bigint      NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    token_hash   varchar(64) NOT NULL,
    emitido_en   timestamptz NOT NULL DEFAULT now(),
    expira_en    timestamptz NOT NULL,
    revocado_en  timestamptz,
    direccion_ip inet,
    user_agent   varchar(250),

    CONSTRAINT uq_sesion_token   UNIQUE (token_hash),
    CONSTRAINT ck_sesion_vigencia CHECK (expira_en > emitido_en)
);

COMMENT ON COLUMN sesion_refresh.token_hash IS
    'SHA-256 del refresh token. El token en claro solo vive en el cliente.';

-- ----------------------------------------------------------------------------
-- BITACORA_AUDITORIA  (RF-16) - tabla append-only
-- ----------------------------------------------------------------------------
CREATE TABLE bitacora_auditoria (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha_hora        timestamptz      NOT NULL DEFAULT now(),
    usuario_id        bigint           REFERENCES usuario(id),
    username_snapshot varchar(40),
    accion            accion_auditoria NOT NULL,
    modulo            varchar(40),
    tabla_afectada    varchar(63),
    registro_id       bigint,
    datos_anteriores  jsonb,
    datos_nuevos      jsonb,
    direccion_ip      inet,
    user_agent        varchar(250)
);

COMMENT ON TABLE bitacora_auditoria IS
    'Bitacora inmutable de cambios criticos y eventos de sesion (RF-16). '
    'Al rol de aplicacion se le concede solo INSERT y SELECT.';

-- ----------------------------------------------------------------------------
-- CLASIFICACION_INFORMACION  (RNF - Decreto 57-2008, Ley de Acceso a la
-- Informacion Publica). Marca cada tabla para el etiquetado de reportes.
-- ----------------------------------------------------------------------------
CREATE TABLE clasificacion_informacion (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tabla            varchar(63)        NOT NULL,
    clasificacion    clasificacion_info NOT NULL,
    fundamento       varchar(250),
    vigencia_reserva date,

    CONSTRAINT uq_clasificacion_tabla UNIQUE (tabla)
);

\echo '>>> 02 Tablas de seguridad creadas'


-- #############################################################################
-- ## 03_tablas_red.sql
-- #############################################################################

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


-- #############################################################################
-- ## 04_tablas_flota.sql
-- #############################################################################

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


-- #############################################################################
-- ## 05_tablas_personal.sql
-- #############################################################################

-- =============================================================================
-- SIC Transmetro | 05_tablas_personal.sql
-- Personas, pilotos (expediente), guardias y cobertura por acceso.
-- Cubre RF-07 y RF-08.
-- =============================================================================

SET search_path = transmetro, public;

-- ----------------------------------------------------------------------------
-- PERSONA  (generalizacion: datos comunes de pilotos y guardias)
-- ----------------------------------------------------------------------------
CREATE TABLE persona (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dpi                  varchar(13)  NOT NULL,
    nombres              varchar(100) NOT NULL,
    apellidos            varchar(100) NOT NULL,
    fecha_nacimiento     date,
    telefono             varchar(20),
    telefono_emergencia  varchar(20),
    correo               citext,
    direccion_residencia varchar(250),
    municipio_residencia varchar(100),
    municipalidad_id     bigint       REFERENCES municipalidad(id),
    activo               boolean      NOT NULL DEFAULT true,
    creado_en            timestamptz  NOT NULL DEFAULT now(),
    creado_por           bigint       REFERENCES usuario(id),
    actualizado_en       timestamptz,
    actualizado_por      bigint       REFERENCES usuario(id),

    CONSTRAINT uq_persona_dpi  UNIQUE (dpi),
    CONSTRAINT ck_persona_dpi  CHECK (dpi ~ '^[0-9]{13}$'),
    -- Mayoria de edad al ingresar: cota fija, no dependiente de la fecha actual
    CONSTRAINT ck_persona_nacimiento CHECK (fecha_nacimiento IS NULL OR fecha_nacimiento > DATE '1930-01-01')
);

-- La cuenta de usuario puede vincularse a la persona (piloto o guardia)
ALTER TABLE usuario
    ADD CONSTRAINT fk_usuario_persona FOREIGN KEY (persona_id) REFERENCES persona(id);

-- Un mismo expediente no puede estar ligado a dos cuentas de usuario
CREATE UNIQUE INDEX ux_usuario_persona ON usuario (persona_id) WHERE persona_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- PILOTO  (especializacion 1:0..1 de PERSONA - RF-07)
-- ----------------------------------------------------------------------------
CREATE TABLE piloto (
    persona_id        bigint          PRIMARY KEY REFERENCES persona(id) ON DELETE CASCADE,
    codigo_piloto     varchar(15)     NOT NULL,
    numero_licencia   varchar(25)     NOT NULL,
    tipo_licencia     tipo_licencia   NOT NULL DEFAULT 'C',
    vigencia_licencia date            NOT NULL,
    fecha_ingreso     date            NOT NULL,
    estado            estado_personal NOT NULL DEFAULT 'activo',
    observaciones     varchar(250),

    CONSTRAINT uq_piloto_codigo   UNIQUE (codigo_piloto),
    CONSTRAINT uq_piloto_licencia UNIQUE (numero_licencia)
);

-- ----------------------------------------------------------------------------
-- PILOTO_EDUCACION  (historial educativo - RF-07)
-- ----------------------------------------------------------------------------
CREATE TABLE piloto_educacion (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    piloto_id       bigint          NOT NULL REFERENCES piloto(persona_id) ON DELETE CASCADE,
    nivel           nivel_educativo NOT NULL,
    institucion     varchar(150)    NOT NULL,
    titulo_obtenido varchar(150),
    anio_inicio     smallint,
    anio_fin        smallint,
    certificado_url varchar(300),

    CONSTRAINT ck_educacion_anios CHECK (
        anio_inicio IS NULL OR anio_fin IS NULL OR anio_fin >= anio_inicio
    ),
    CONSTRAINT ck_educacion_rango CHECK (
        (anio_inicio IS NULL OR anio_inicio BETWEEN 1950 AND 2100) AND
        (anio_fin    IS NULL OR anio_fin    BETWEEN 1950 AND 2100)
    )
);

-- ----------------------------------------------------------------------------
-- GUARDIA  (especializacion 1:0..1 de PERSONA)
-- ----------------------------------------------------------------------------
CREATE TABLE guardia (
    persona_id        bigint          PRIMARY KEY REFERENCES persona(id) ON DELETE CASCADE,
    codigo_guardia    varchar(15)     NOT NULL,
    empresa_seguridad varchar(120),
    numero_credencial varchar(25),
    fecha_ingreso     date            NOT NULL,
    estado            estado_personal NOT NULL DEFAULT 'activo',

    CONSTRAINT uq_guardia_codigo UNIQUE (codigo_guardia)
);

-- ----------------------------------------------------------------------------
-- TURNO  (catalogo ampliable por el administrador)
-- ----------------------------------------------------------------------------
CREATE TABLE turno (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo           varchar(15) NOT NULL,
    nombre           varchar(60) NOT NULL,
    hora_inicio      time        NOT NULL,
    hora_fin         time        NOT NULL,
    cruza_medianoche boolean     NOT NULL DEFAULT false,
    activo           boolean     NOT NULL DEFAULT true,

    CONSTRAINT uq_turno_codigo UNIQUE (codigo),
    CONSTRAINT ck_turno_horas  CHECK (cruza_medianoche OR hora_fin > hora_inicio)
);

-- ----------------------------------------------------------------------------
-- GUARDIA_ASIGNACION  (cobertura por acceso - RF-08)
-- ----------------------------------------------------------------------------
CREATE TABLE guardia_asignacion (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    guardia_id  bigint           NOT NULL REFERENCES guardia(persona_id) ON DELETE CASCADE,
    acceso_id   bigint           NOT NULL REFERENCES acceso(id)          ON DELETE CASCADE,
    turno_id    bigint           NOT NULL REFERENCES turno(id),
    fecha       date             NOT NULL,
    estado      estado_cobertura NOT NULL DEFAULT 'programado',
    observacion varchar(250),
    creado_en   timestamptz      NOT NULL DEFAULT now(),
    creado_por  bigint           REFERENCES usuario(id),

    -- Un guardia no puede estar en dos accesos en el mismo turno del mismo dia
    CONSTRAINT uq_guardia_turno UNIQUE (guardia_id, fecha, turno_id)
);

COMMENT ON TABLE guardia_asignacion IS
    'RF-08: la cobertura efectiva se compara contra acceso.guardias_minimos '
    'mediante la vista v_cobertura_guardias y el trigger tg_cobertura_guardias.';

\echo '>>> 05 Tablas de personal creadas'


-- #############################################################################
-- ## 06_tablas_operacion.sql
-- #############################################################################

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


-- #############################################################################
-- ## 07_tablas_pagos.sql
-- #############################################################################

-- =============================================================================
-- SIC Transmetro | 07_tablas_pagos.sql
-- Tarjetas de acceso/pago, transacciones y conciliacion diaria.
-- Cubre RF-12.
-- =============================================================================

SET search_path = transmetro, public;

-- ----------------------------------------------------------------------------
-- TARJETA
-- El numero de tarjeta en claro NUNCA se persiste: se guarda el SHA-256 y los
-- ultimos 4 digitos para busqueda asistida (clasificacion: confidencial).
-- ----------------------------------------------------------------------------
CREATE TABLE tarjeta (
    id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero_tarjeta_hash      varchar(64)    NOT NULL,
    ultimos_4                char(4)        NOT NULL,
    tipo                     tipo_tarjeta   NOT NULL DEFAULT 'ordinaria',
    saldo                    numeric(10,2)  NOT NULL DEFAULT 0,
    estado                   estado_tarjeta NOT NULL DEFAULT 'activa',
    fecha_emision            date           NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento        date,
    municipalidad_emisora_id bigint         REFERENCES municipalidad(id),
    titular_persona_id       bigint         REFERENCES persona(id),
    creado_en                timestamptz    NOT NULL DEFAULT now(),
    creado_por               bigint         REFERENCES usuario(id),

    CONSTRAINT uq_tarjeta_hash   UNIQUE (numero_tarjeta_hash),
    CONSTRAINT ck_tarjeta_saldo  CHECK (saldo >= 0),
    CONSTRAINT ck_tarjeta_ult4   CHECK (ultimos_4 ~ '^[0-9]{4}$'),
    CONSTRAINT ck_tarjeta_hash   CHECK (numero_tarjeta_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_tarjeta_vence  CHECK (fecha_vencimiento IS NULL OR fecha_vencimiento > fecha_emision)
);

-- ----------------------------------------------------------------------------
-- TRANSACCION_PAGO  (RF-12)
-- referencia_externa da idempotencia frente a reintentos del proveedor.
-- ----------------------------------------------------------------------------
CREATE TABLE transaccion_pago (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tarjeta_id        bigint             NOT NULL REFERENCES tarjeta(id),
    estacion_id       bigint             NOT NULL REFERENCES estacion(id),
    acceso_id         bigint             REFERENCES acceso(id),
    fecha_hora        timestamptz        NOT NULL DEFAULT now(),
    tipo              tipo_transaccion   NOT NULL,
    monto             numeric(8,2)       NOT NULL,
    saldo_posterior   numeric(10,2),
    dispositivo_id    varchar(40),
    referencia_externa varchar(64)       NOT NULL,
    estado            estado_transaccion NOT NULL DEFAULT 'aplicada',
    creado_en         timestamptz        NOT NULL DEFAULT now(),

    CONSTRAINT uq_transaccion_referencia UNIQUE (referencia_externa),
    CONSTRAINT ck_transaccion_monto      CHECK (monto > 0),
    CONSTRAINT ck_transaccion_saldo      CHECK (saldo_posterior IS NULL OR saldo_posterior >= 0)
);

COMMENT ON COLUMN transaccion_pago.referencia_externa IS
    'Identificador del proveedor de recaudo. UNIQUE para garantizar idempotencia (RF-12).';

-- ----------------------------------------------------------------------------
-- CONCILIACION  (RF-12) - una por estacion y dia
-- ----------------------------------------------------------------------------
CREATE TABLE conciliacion (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha               date                NOT NULL,
    estacion_id         bigint              NOT NULL REFERENCES estacion(id),
    total_transacciones integer             NOT NULL DEFAULT 0,
    monto_sistema       numeric(12,2)       NOT NULL DEFAULT 0,
    monto_reportado     numeric(12,2)       NOT NULL DEFAULT 0,
    diferencia          numeric(12,2) GENERATED ALWAYS AS (monto_reportado - monto_sistema) STORED,
    estado              estado_conciliacion NOT NULL DEFAULT 'descuadrada',
    nota                varchar(500),
    conciliado_por      bigint              REFERENCES usuario(id),
    conciliado_en       timestamptz,

    CONSTRAINT uq_conciliacion_dia   UNIQUE (fecha, estacion_id),
    CONSTRAINT ck_conciliacion_total CHECK (total_transacciones >= 0),
    CONSTRAINT ck_conciliacion_montos CHECK (monto_sistema >= 0 AND monto_reportado >= 0)
);

\echo '>>> 07 Tablas de pagos creadas'


-- #############################################################################
-- ## 08_reglas_negocio.sql
-- #############################################################################

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


-- #############################################################################
-- ## 09_indices.sql
-- #############################################################################

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


-- #############################################################################
-- ## 10_vistas.sql
-- #############################################################################

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


-- #############################################################################
-- ## 11_seed.sql
-- #############################################################################

-- =============================================================================
-- SIC Transmetro | 11_seed.sql
-- Datos iniciales: catalogos obligatorios (modulos, roles, matriz de permisos,
-- turnos, clasificacion de informacion) y un juego de datos de EJEMPLO para
-- ambiente de desarrollo.
--
-- AVISO: los nombres de estaciones, placas, DPI y correos son ficticios y solo
-- sirven para pruebas. No corresponden al catalogo oficial del Transmetro.
--
-- Contrasena de todos los usuarios de ejemplo: Transmetro2026*
-- =============================================================================

SET search_path = transmetro, public;

BEGIN;

-- ============================================================================
-- 1. MUNICIPALIDADES  (RF-13)
-- ============================================================================
INSERT INTO municipalidad (codigo, nombre, departamento, telefono) VALUES
    ('GT',    'Municipalidad de Guatemala',      'Guatemala', '1551'),
    ('MIX',   'Municipalidad de Mixco',          'Guatemala', '2432-0000'),
    ('VN',    'Municipalidad de Villa Nueva',    'Guatemala', '6628-0000'),
    ('VC',    'Municipalidad de Villa Canales',  'Guatemala', '6634-0000'),
    ('SMP',   'Municipalidad de San Miguel Petapa', 'Guatemala', '6630-0000');

-- ============================================================================
-- 2. MODULOS DEL SISTEMA  (unidades protegidas)
-- ============================================================================
INSERT INTO modulo (codigo, nombre, descripcion, orden) VALUES
    ('LINEAS_ESTACIONES', 'Gestion de lineas y estaciones', 'Catalogo de red, recorridos y accesos (RF-01 a RF-03)', 1),
    ('FLOTA',             'Gestion de flota',              'Unidades, asignacion a linea y parqueos (RF-04 a RF-06)', 2),
    ('PERSONAL',          'Gestion de personal',           'Pilotos, guardias y coberturas (RF-07, RF-08)', 3),
    ('MONITOREO',         'Monitoreo de capacidad y servicio', 'Ocupacion, sobrecupo y despachos (RF-09, RF-10)', 4),
    ('TECNICA',           'Administracion tecnica',        'Equipo de computo y conectividad (RF-11)', 5),
    ('PAGOS',             'Conciliacion de pagos',         'Tarjetas, transacciones y cuadre diario (RF-12)', 6),
    ('REPORTERIA',        'Reporteria gerencial',          'Reportes consolidados y exportacion (RF-14)', 7),
    ('SEGURIDAD',         'Seguridad y administracion',    'Usuarios, roles y bitacora (RF-15, RF-16)', 8);

-- ============================================================================
-- 3. ROLES
-- ============================================================================
INSERT INTO rol (codigo, nombre, descripcion, ambito) VALUES
    ('OPERADOR_ESTACION', 'Operador de estacion',   'Captura operativa en su estacion',              'estacion'),
    ('PILOTO',            'Piloto',                 'Consulta de su expediente y registro de viajes', 'propio'),
    ('GUARDIA',           'Guardia de seguridad',   'Registro de su cobertura por acceso',            'propio'),
    ('ADMIN_MUNICIPAL',   'Administrador municipal','Gestion completa dentro de su municipalidad',    'municipal'),
    ('ADMIN_GENERAL',     'Administrador general',  'Administracion total del sistema',               'global');

-- ============================================================================
-- 4. MATRIZ DE PERMISOS  (RF-15)
--    L = lectura | E = escritura en su ambito | A = administracion total
--    La ausencia de fila equivale a "sin acceso".
-- ============================================================================
INSERT INTO rol_permiso (rol_id, modulo_id, nivel)
SELECT r.id, m.id, v.nivel::nivel_permiso
  FROM (VALUES
        -- modulo,              operador, piloto, guardia, admin_mun, admin_gral
        ('LINEAS_ESTACIONES', 'OPERADOR_ESTACION', 'L'),
        ('LINEAS_ESTACIONES', 'PILOTO',            'L'),
        ('LINEAS_ESTACIONES', 'GUARDIA',           'L'),
        ('LINEAS_ESTACIONES', 'ADMIN_MUNICIPAL',   'E'),
        ('LINEAS_ESTACIONES', 'ADMIN_GENERAL',     'A'),

        ('FLOTA',             'OPERADOR_ESTACION', 'L'),
        ('FLOTA',             'PILOTO',            'L'),
        ('FLOTA',             'ADMIN_MUNICIPAL',   'E'),
        ('FLOTA',             'ADMIN_GENERAL',     'A'),

        ('PERSONAL',          'PILOTO',            'L'),
        ('PERSONAL',          'GUARDIA',           'E'),
        ('PERSONAL',          'ADMIN_MUNICIPAL',   'E'),
        ('PERSONAL',          'ADMIN_GENERAL',     'A'),

        ('MONITOREO',         'OPERADOR_ESTACION', 'E'),
        ('MONITOREO',         'PILOTO',            'E'),
        ('MONITOREO',         'ADMIN_MUNICIPAL',   'L'),
        ('MONITOREO',         'ADMIN_GENERAL',     'A'),

        ('TECNICA',           'OPERADOR_ESTACION', 'E'),
        ('TECNICA',           'ADMIN_MUNICIPAL',   'L'),
        ('TECNICA',           'ADMIN_GENERAL',     'A'),

        ('PAGOS',             'OPERADOR_ESTACION', 'E'),
        ('PAGOS',             'ADMIN_MUNICIPAL',   'L'),
        ('PAGOS',             'ADMIN_GENERAL',     'A'),

        ('REPORTERIA',        'ADMIN_MUNICIPAL',   'L'),
        ('REPORTERIA',        'ADMIN_GENERAL',     'A'),

        ('SEGURIDAD',         'ADMIN_MUNICIPAL',   'E'),
        ('SEGURIDAD',         'ADMIN_GENERAL',     'A')
  ) AS v(modulo_codigo, rol_codigo, nivel)
  JOIN modulo m ON m.codigo = v.modulo_codigo
  JOIN rol    r ON r.codigo = v.rol_codigo;

-- ============================================================================
-- 5. TURNOS
-- ============================================================================
INSERT INTO turno (codigo, nombre, hora_inicio, hora_fin, cruza_medianoche) VALUES
    ('T1', 'Matutino',  '04:00', '12:00', false),
    ('T2', 'Vespertino','12:00', '20:00', false),
    ('T3', 'Nocturno',  '20:00', '04:00', true);

-- ============================================================================
-- 6. CLASIFICACION DE LA INFORMACION  (Decreto 57-2008)
-- ============================================================================
INSERT INTO clasificacion_informacion (tabla, clasificacion, fundamento) VALUES
    ('linea',                'publica',      'Informacion de oficio: rutas y cobertura del servicio'),
    ('estacion',             'publica',      'Informacion de oficio: ubicacion de estaciones'),
    ('linea_estacion',       'publica',      'Informacion de oficio: recorridos y distancias'),
    ('acceso',               'publica',      'Informacion de oficio: accesos habilitados'),
    ('bus',                  'publica',      'Inventario de unidades del servicio publico'),
    ('persona',              'confidencial', 'Datos personales sensibles (art. 9 num. 5)'),
    ('piloto',               'confidencial', 'Datos laborales y de licencia'),
    ('piloto_educacion',     'confidencial', 'Historial educativo del trabajador'),
    ('guardia',              'reservada',    'Identidad del personal de seguridad'),
    ('guardia_asignacion',   'reservada',    'Despliegue de seguridad por acceso y turno'),
    ('tarjeta',              'confidencial', 'Medio de pago vinculado a persona identificable'),
    ('transaccion_pago',     'confidencial', 'Habitos de desplazamiento del usuario'),
    ('conciliacion',         'publica',      'Recaudacion agregada por estacion'),
    ('usuario',              'confidencial', 'Credenciales y datos de cuenta'),
    ('bitacora_auditoria',   'reservada',    'Registro de control interno');

-- ============================================================================
-- 7. LINEAS  (datos de ejemplo)
-- ============================================================================
-- Los corredores reproducen los corredores reales del Transmetro
-- (Eje Sur Centra Sur-Tikal Futura, Eje Norte CENMA-Galerias Primma,
--  Calzada San Juan, 12 calle zona 6). Tarifa de Q1.00 en servicio regular y
--  Q2.00 en expres; horario de 04:30 a 21:30 de lunes a sabado.
INSERT INTO linea (codigo, nombre, color_hex, tipo, municipalidad_id,
                   unidades_minimas, unidades_maximas, estado, fecha_inicio_operacion,
                   tarifa, hora_inicio, hora_fin, frecuencia_pico_min, frecuencia_valle_min)
SELECT v.codigo, v.nombre, v.color, v.tipo::tipo_linea, m.id,
       v.umin, v.umax, v.estado::estado_linea, v.inicio::date,
       v.tarifa, v.inicio_op::time, v.fin_op::time, v.pico, v.valle
  FROM (VALUES
        ('L1', 'Eje Sur - Centra Sur a Tikal Futura',      '#0057B8', 'troncal',      'GT',  34, 46, 'activa', '2007-02-03', 1.00, '04:30', '21:30',  5, 15),
        ('L2', 'Eje Norte - CENMA a Galerias Primma',      '#E4002B', 'troncal',      'GT',  30, 42, 'activa', '2011-06-15', 1.00, '04:30', '21:30',  6, 15),
        ('L3', 'Eje Central - Centra Sur a Centro Civico', '#009639', 'troncal',      'GT',  24, 34, 'activa', '2013-09-01', 1.00, '05:00', '21:00',  8, 18),
        ('L4', 'Calzada San Juan - Mixco a Zona 11',       '#FFB81C', 'troncal',      'MIX', 22, 32, 'activa', '2016-03-10', 1.00, '05:00', '21:00',  8, 20),
        ('L5', 'Expres 12 Calle - Zona 6 a Zona 18',       '#7D3F98', 'expres',       'GT',  18, 26, 'activa', '2018-07-20', 2.00, '05:30', '20:30', 10, 20),
        ('L6', 'Alimentadora Sur - Villa Nueva a Centra Sur','#00A3E0','alimentadora','VN',  16, 26, 'activa', '2020-01-15', 1.00, '05:00', '21:00', 10, 20),
        ('L7', 'Alimentadora Norte - Mixco a CENMA',       '#FF6A13', 'alimentadora', 'MIX', 14, 22, 'activa', '2022-05-02', 1.00, '05:00', '21:00', 12, 25)
  ) AS v(codigo, nombre, color, tipo, muni, umin, umax, estado, inicio, tarifa, inicio_op, fin_op, pico, valle)
  JOIN municipalidad m ON m.codigo = v.muni;

-- Parametros de operacion editables por el administrador general
INSERT INTO parametro_sistema (clave, valor, unidad, descripcion) VALUES
    ('TARIFA_REGULAR',        '1.00',  'Q',       'Tarifa del servicio troncal y alimentador'),
    ('TARIFA_EXPRES',         '2.00',  'Q',       'Tarifa del servicio expres'),
    ('VENTANA_TRANSBORDO',    '60',    'minutos', 'Tiempo dentro del cual un transbordo no cobra pasaje adicional'),
    ('COSTO_TARJETA',         '20.00', 'Q',       'Costo de emision de la tarjeta prepago, incluye 5 pasajes'),
    ('UMBRAL_SOBRECUPO',      '150',   '%',       'Porcentaje de la capacidad nominal que define el sobrecupo (RF-09)'),
    ('ESPERA_MINIMA_MINUTOS', '5',     'minutos', 'Espera obligatoria con ocupacion menor al 25 % (RF-10)'),
    ('OCUPACION_MINIMA_PCT',  '25',    '%',       'Ocupacion por debajo de la cual aplica la espera obligatoria (RF-10)');

-- ============================================================================
-- 8. ESTACIONES Y ACCESOS  (muestra de la Linea 1)
-- ============================================================================
INSERT INTO estacion (codigo, nombre, municipalidad_id, tipo, latitud, longitud,
                      capacidad_personas, estado)
SELECT v.codigo, v.nombre, m.id, v.tipo::tipo_estacion, v.lat, v.lon, v.cap, 'operativa'
  FROM (VALUES
        -- Corredor Eje Sur (Linea 1): Centra Sur hacia Tikal Futura
        ('E-L1-01', 'Centra Sur',             'GT', 'terminal',      14.560100, -90.550200, 650),
        ('E-L1-02', 'Villa Lobos',            'GT', 'troncal',       14.566300, -90.548700, 240),
        ('E-L1-03', 'El Frutal',              'GT', 'troncal',       14.572900, -90.546100, 230),
        ('E-L1-04', 'Plaza Municipal',        'GT', 'troncal',       14.579400, -90.543800, 220),
        ('E-L1-05', 'Universidad de San Carlos','GT','transferencia',14.585200, -90.541500, 420),
        ('E-L1-06', 'Hospital Roosevelt',     'GT', 'troncal',       14.591800, -90.538900, 310),
        ('E-L1-07', 'Trebol',                 'GT', 'transferencia', 14.598400, -90.536200, 480),
        ('E-L1-08', 'Calzada Roosevelt',      'GT', 'troncal',       14.604900, -90.533600, 260),
        ('E-L1-09', 'Plaza Berlin',           'GT', 'troncal',       14.611500, -90.531000, 230),
        ('E-L1-10', 'Tikal Futura',           'GT', 'terminal',      14.618100, -90.528400, 520),
        -- Corredor Eje Norte (Linea 2): CENMA hacia Galerias Primma
        ('E-L2-01', 'CENMA',                  'GT', 'terminal',      14.556000, -90.530000, 700),
        ('E-L2-02', 'Mercado La Terminal',    'GT', 'troncal',       14.570000, -90.524000, 300),
        ('E-L2-03', 'Centro Civico',          'GT', 'transferencia', 14.612000, -90.516000, 450),
        ('E-L2-04', 'Zona 1 Centro Historico','GT', 'troncal',       14.641000, -90.513000, 380),
        ('E-L2-05', 'Parque Jocotenango',     'GT', 'troncal',       14.652000, -90.510000, 260),
        ('E-L2-06', 'Galerias Primma',        'GT', 'terminal',      14.668000, -90.498000, 480),
        -- Corredor Calzada San Juan (Linea 4): Mixco hacia zona 11
        ('E-L4-01', 'Terminal Mixco',         'MIX','terminal',      14.628000, -90.606000, 420),
        ('E-L4-02', 'San Cristobal',          'MIX','troncal',       14.624000, -90.595000, 250),
        ('E-L4-03', 'Calzada San Juan',       'MIX','troncal',       14.620000, -90.580000, 240),
        ('E-L4-04', 'Zona 11 Mariscal',       'GT', 'transferencia', 14.616000, -90.560000, 330),
        -- Corredor 12 calle, servicio expres (Linea 5)
        ('E-L5-01', 'Zona 6 Proyectos',       'GT', 'terminal',      14.655000, -90.490000, 330),
        ('E-L5-02', '12 Calle Zona 6',        'GT', 'troncal',       14.650000, -90.480000, 210),
        ('E-L5-03', 'Zona 18 Atlantida',      'GT', 'terminal',      14.660000, -90.465000, 340),
        -- Alimentadoras
        ('E-L6-01', 'Villa Nueva Centro',     'VN', 'terminal',      14.526000, -90.587000, 390),
        ('E-L6-02', 'Barcenas',               'VN', 'troncal',       14.535000, -90.575000, 220),
        ('E-L7-01', 'Mixco Norte',            'MIX','terminal',      14.645000, -90.600000, 360)
  ) AS v(codigo, nombre, muni, tipo, lat, lon, cap)
  JOIN municipalidad m ON m.codigo = v.muni;

-- Dos accesos por estacion de la Linea 1 (RF-03)
INSERT INTO acceso (estacion_id, codigo, nombre, tipo, torniquetes, guardias_minimos)
SELECT e.id, 'A1', 'Acceso Norte', 'pasarela',
       CASE WHEN e.tipo = 'terminal' THEN 6 ELSE 4 END,
       CASE WHEN e.tipo = 'terminal' THEN 2 ELSE 1 END
  FROM estacion e;

INSERT INTO acceso (estacion_id, codigo, nombre, tipo, torniquetes, guardias_minimos)
SELECT e.id, 'A2', 'Acceso Sur', 'rampa', 3, 1
  FROM estacion e
 WHERE e.tipo IN ('terminal', 'transferencia');

-- ============================================================================
-- 9. RECORRIDO DE LA LINEA 1  (RF-01, RF-02)
-- ============================================================================
-- Sentido ida: del Terminal Sur al Terminal Centro
INSERT INTO linea_estacion (linea_id, estacion_id, sentido, orden_recorrido,
                            distancia_km_siguiente, tiempo_estimado_min)
SELECT l.id, e.id, 'ida', v.orden, v.dist, v.tiempo
  FROM (VALUES
        ('E-L1-01',  1, 0.850, 3),
        ('E-L1-02',  2, 0.920, 3),
        ('E-L1-03',  3, 0.780, 2),
        ('E-L1-04',  4, 1.050, 4),
        ('E-L1-05',  5, 0.890, 3),
        ('E-L1-06',  6, 0.940, 3),
        ('E-L1-07',  7, 1.120, 4),
        ('E-L1-08',  8, 0.870, 3),
        ('E-L1-09',  9, 0.960, 3),
        ('E-L1-10', 10, NULL,  NULL)
  ) AS v(estacion_codigo, orden, dist, tiempo)
  JOIN estacion e ON e.codigo = v.estacion_codigo
  CROSS JOIN linea l
 WHERE l.codigo = 'L1';

-- Sentido vuelta: orden inverso
INSERT INTO linea_estacion (linea_id, estacion_id, sentido, orden_recorrido,
                            distancia_km_siguiente, tiempo_estimado_min)
SELECT l.id, e.id, 'vuelta', 11 - v.orden,
       CASE WHEN v.orden = 1 THEN NULL ELSE v.dist_prev END,
       CASE WHEN v.orden = 1 THEN NULL ELSE v.tiempo_prev END
  FROM (VALUES
        ('E-L1-10', 10, 0.960, 3),
        ('E-L1-09',  9, 0.870, 3),
        ('E-L1-08',  8, 1.120, 4),
        ('E-L1-07',  7, 0.940, 3),
        ('E-L1-06',  6, 0.890, 3),
        ('E-L1-05',  5, 1.050, 4),
        ('E-L1-04',  4, 0.780, 2),
        ('E-L1-03',  3, 0.920, 3),
        ('E-L1-02',  2, 0.850, 3),
        ('E-L1-01',  1, NULL,  NULL)
  ) AS v(estacion_codigo, orden, dist_prev, tiempo_prev)
  JOIN estacion e ON e.codigo = v.estacion_codigo
  CROSS JOIN linea l
 WHERE l.codigo = 'L1';

-- Recorridos de las demas lineas (sentido ida)
INSERT INTO linea_estacion (linea_id, estacion_id, sentido, orden_recorrido,
                            distancia_km_siguiente, tiempo_estimado_min)
SELECT l.id, e.id, 'ida', v.orden, v.dist, v.tiempo
  FROM (VALUES
        ('L2', 'E-L2-01', 1, 2.400, 7),
        ('L2', 'E-L2-02', 2, 3.100, 9),
        ('L2', 'E-L2-03', 3, 2.800, 8),
        ('L2', 'E-L2-04', 4, 1.900, 6),
        ('L2', 'E-L2-05', 5, 2.200, 7),
        ('L2', 'E-L2-06', 6, NULL,  NULL),
        ('L3', 'E-L1-01', 1, 4.200, 12),
        ('L3', 'E-L1-07', 2, 3.600, 11),
        ('L3', 'E-L2-03', 3, NULL,  NULL),
        ('L4', 'E-L4-01', 1, 1.800, 6),
        ('L4', 'E-L4-02', 2, 2.100, 7),
        ('L4', 'E-L4-03', 3, 2.600, 8),
        ('L4', 'E-L4-04', 4, NULL,  NULL),
        ('L5', 'E-L5-01', 1, 1.500, 4),
        ('L5', 'E-L5-02', 2, 2.000, 5),
        ('L5', 'E-L5-03', 3, NULL,  NULL),
        ('L6', 'E-L6-01', 1, 2.300, 8),
        ('L6', 'E-L6-02', 2, 5.400, 15),
        ('L6', 'E-L1-01', 3, NULL,  NULL),
        ('L7', 'E-L7-01', 1, 6.200, 18),
        ('L7', 'E-L2-01', 2, NULL,  NULL)
  ) AS v(linea, estacion, orden, dist, tiempo)
  JOIN linea l    ON l.codigo = v.linea
  JOIN estacion e ON e.codigo = v.estacion;

-- Sentido vuelta: mismo trazo en orden inverso
INSERT INTO linea_estacion (linea_id, estacion_id, sentido, orden_recorrido,
                            distancia_km_siguiente, tiempo_estimado_min)
SELECT le.linea_id, le.estacion_id, 'vuelta',
       total.n + 1 - le.orden_recorrido,
       lag(le.distancia_km_siguiente) OVER (PARTITION BY le.linea_id ORDER BY le.orden_recorrido),
       lag(le.tiempo_estimado_min)    OVER (PARTITION BY le.linea_id ORDER BY le.orden_recorrido)
  FROM linea_estacion le
  JOIN linea l ON l.id = le.linea_id AND l.codigo <> 'L1'
  JOIN (
        SELECT linea_id, max(orden_recorrido) AS n
          FROM linea_estacion WHERE sentido = 'ida' GROUP BY linea_id
       ) total ON total.linea_id = le.linea_id
 WHERE le.sentido = 'ida';

-- ============================================================================
-- 10. PARQUEOS  (RF-06)
-- ============================================================================
INSERT INTO parqueo_predio (codigo, nombre, municipalidad_id, direccion, capacidad)
SELECT 'P-SUR', 'Predio Centra Sur', m.id, 'Kilometro 12 ruta al Pacifico', 120 FROM municipalidad m WHERE m.codigo = 'GT'
UNION ALL
SELECT 'P-NOR', 'Predio CENMA',      m.id, 'Zona 12, anillo periferico',   100 FROM municipalidad m WHERE m.codigo = 'GT'
UNION ALL
SELECT 'P-MIX', 'Predio Mixco',      m.id, 'Calzada San Juan zona 7 Mixco', 80 FROM municipalidad m WHERE m.codigo = 'MIX';

-- Espacios por predio, segun su capacidad declarada
INSERT INTO parqueo_espacio (predio_id, codigo, estado)
SELECT p.id, p.codigo || '-' || lpad(g::text, 3, '0'), 'disponible'
  FROM parqueo_predio p
  CROSS JOIN LATERAL generate_series(1, p.capacidad) AS g;

-- ============================================================================
-- 11. FLOTA  (RF-04) - 170 unidades distribuidas en las siete lineas
-- ============================================================================
INSERT INTO bus (placa, numero_economico, municipalidad_id, tipo, marca, modelo,
                 anio, capacidad_sentados, capacidad_pie, estado)
SELECT 'C' || lpad(g::text, 3, '0') || 'BUS',
       'TM-' || lpad(g::text, 3, '0'),
       m.id,
       -- Las unidades de mayor numero son biarticuladas, de mas capacidad
       CASE WHEN g % 10 = 0 THEN 'biarticulado'::tipo_bus ELSE 'articulado'::tipo_bus END,
       CASE WHEN g % 3 = 0 THEN 'Volvo' ELSE 'Marcopolo' END,
       CASE WHEN g % 10 = 0 THEN 'Gran Viale BRT' ELSE '7900A' END,
       2015 + (g % 8),
       CASE WHEN g % 10 = 0 THEN 60 ELSE 45 END,
       CASE WHEN g % 10 = 0 THEN 150 ELSE 115 END,
       -- Unas pocas unidades en taller, para que el tablero refleje la realidad
       CASE WHEN g % 25 = 0 THEN 'mantenimiento'::estado_bus ELSE 'operativo'::estado_bus END
  FROM generate_series(1, 170) AS g
  CROSS JOIN municipalidad m
 WHERE m.codigo = 'GT';

-- Asignacion a linea: cada unidad a una sola linea activa (RF-04).
-- El reparto deja a la linea L5 por debajo de su minimo, de modo que la alerta
-- de rango (RF-05) tenga un caso real que mostrar.
INSERT INTO bus_linea_asignacion (bus_id, linea_id, fecha_inicio, motivo)
SELECT b.id, l.id, now() - INTERVAL '30 days', 'Carga inicial del sistema'
  FROM (
        SELECT id, row_number() OVER (ORDER BY numero_economico) AS rn FROM bus
       ) b
  JOIN (VALUES
        ('L1',   1,  38),
        ('L2',  39,  71),
        ('L3',  72,  97),
        ('L4',  98, 121),
        ('L5', 122, 136),
        ('L6', 137, 154),
        ('L7', 155, 169)
  ) AS r(codigo, desde, hasta) ON b.rn BETWEEN r.desde AND r.hasta
  JOIN linea l ON l.codigo = r.codigo;

-- Parqueo vigente para cada unidad, repartido entre los tres predios
INSERT INTO parqueo_asignacion (espacio_id, bus_id, fecha_inicio, motivo)
SELECT pe.id, b.id, now() - INTERVAL '30 days', 'Asignacion inicial'
  FROM (
        SELECT id, row_number() OVER (ORDER BY numero_economico) AS rn FROM bus
       ) b
  JOIN (
        SELECT pe.id, row_number() OVER (ORDER BY pp.codigo, pe.codigo) AS rn
          FROM parqueo_espacio pe
          JOIN parqueo_predio pp ON pp.id = pe.predio_id
       ) pe ON pe.rn = b.rn;

-- ============================================================================
-- 12. PERSONAL  (RF-07, RF-08)
-- ============================================================================
INSERT INTO persona (dpi, nombres, apellidos, fecha_nacimiento, telefono, correo,
                     direccion_residencia, municipio_residencia, municipalidad_id)
SELECT v.dpi, v.nombres, v.apellidos, v.nacimiento::date, v.telefono, v.correo,
       v.direccion, v.municipio, m.id
  FROM (VALUES
        ('2547896320101', 'Carlos Eduardo',  'Ramirez Lopez',   '1985-04-12', '5512-3401', 'cramirez@ejemplo.gt',  '5a calle 3-45 zona 12', 'Guatemala',   'GT'),
        ('1998745630101', 'Maria Jose',      'Gonzalez Perez',  '1990-08-25', '5512-3402', 'mgonzalez@ejemplo.gt', '2a avenida 8-20 zona 7','Guatemala',   'GT'),
        ('3025874190101', 'Luis Fernando',   'Morales Diaz',    '1988-11-03', '5512-3403', 'lmorales@ejemplo.gt',  '10a calle 1-15 zona 1', 'Guatemala',   'GT'),
        ('2874196350108', 'Ana Lucia',       'Castillo Ruiz',   '1993-02-17', '5512-3404', 'acastillo@ejemplo.gt', '4a avenida 5-60',       'Mixco',       'MIX'),
        ('3596428170101', 'Jorge Antonio',   'Hernandez Solis', '1982-06-30', '5512-3405', 'jhernandez@ejemplo.gt','7a calle 12-30 zona 21','Guatemala',   'GT')
  ) AS v(dpi, nombres, apellidos, nacimiento, telefono, correo, direccion, municipio, muni)
  JOIN municipalidad m ON m.codigo = v.muni;

-- Plantilla adicional generada, para que los listados tengan volumen real
INSERT INTO persona (dpi, nombres, apellidos, fecha_nacimiento, telefono, correo,
                     direccion_residencia, municipio_residencia, municipalidad_id)
SELECT lpad((1000000000000 + g * 7919)::text, 13, '0'),
       (ARRAY['Jose','Marvin','Sergio','Edwin','Byron','Walter','Mynor','Estuardo',
              'Ligia','Karina','Vilma','Silvia','Oscar','Rene','Hugo','Mario'])[1 + (g % 16)],
       (ARRAY['Lopez Garcia','Perez Sosa','Chavez Mejia','Ruano Lima','Ixcoy Pu',
              'Alvarado Cruz','Say Tzoc','Monroy Vela'])[1 + (g % 8)],
       DATE '1980-01-01' + (g * 97)::int,
       '5' || lpad((500000 + g * 311)::text, 7, '0'),
       'persona' || g || '@ejemplo.gt',
       (1 + g % 20) || ' calle ' || (1 + g % 15) || '-' || (10 + g % 80) || ' zona ' || (1 + g % 21),
       (ARRAY['Guatemala','Mixco','Villa Nueva','Villa Canales','San Miguel Petapa'])[1 + (g % 5)],
       m.id
  FROM generate_series(1, 24) AS g
  CROSS JOIN municipalidad m
 WHERE m.codigo = 'GT';

INSERT INTO piloto (persona_id, codigo_piloto, numero_licencia, tipo_licencia,
                    vigencia_licencia, fecha_ingreso, estado)
SELECT p.id, 'PIL-' || lpad((row_number() OVER (ORDER BY p.id))::text, 3, '0'),
       'LIC-' || p.dpi, 'C',
       -- Algunas licencias vencidas o por vencer, para que la alerta tenga sentido
       CASE WHEN p.id % 9 = 0 THEN CURRENT_DATE - 30
            WHEN p.id % 7 = 0 THEN CURRENT_DATE + 25
            ELSE DATE '2028-12-31' END,
       DATE '2015-01-15' + (p.id * 23)::int, 'activo'
  FROM persona p
 WHERE p.dpi IN ('2547896320101', '1998745630101', '3025874190101')
    OR p.correo LIKE 'persona%@ejemplo.gt' AND (p.id % 2) = 0;

INSERT INTO piloto_educacion (piloto_id, nivel, institucion, titulo_obtenido, anio_inicio, anio_fin)
SELECT pi.persona_id, 'diversificado', 'Instituto Tecnico Nacional',
       'Bachiller en Ciencias y Letras', 2002, 2005
  FROM piloto pi;

INSERT INTO guardia (persona_id, codigo_guardia, empresa_seguridad, numero_credencial,
                     fecha_ingreso, estado)
SELECT p.id, 'GUA-' || lpad((row_number() OVER (ORDER BY p.id))::text, 3, '0'),
       (ARRAY['Seguridad Integral S.A.', 'Proteccion Metropolitana S.A.'])[1 + (p.id % 2)],
       'CRED-' || right(p.dpi, 6), DATE '2019-03-01' + (p.id * 11)::int, 'activo'
  FROM persona p
 WHERE p.dpi IN ('2874196350108', '3596428170101')
    OR (p.correo LIKE 'persona%@ejemplo.gt' AND (p.id % 2) = 1);

-- ============================================================================
-- 13. USUARIOS DE EJEMPLO  (RF-15)
-- Contrasena de todos: Transmetro2026*
-- ============================================================================
INSERT INTO usuario (username, correo, password_hash, nombre_completo,
                     municipalidad_id, estacion_id, estado, debe_cambiar_password)
SELECT v.username,
       v.correo,
       '$2b$12$RTzpEGCGvSOvozAAXaOsgOmsozKYUFddhxT2treYnKrYMWou1e1Rq',
       v.nombre,
       m.id,
       e.id,
       'activo',
       true
  FROM (VALUES
        ('admin.general',  'admin.general@transmetro.gt',  'Administrador General', 'GT',  NULL),
        ('admin.muni.gt',  'admin.muni@transmetro.gt',     'Administrador Municipal Guatemala', 'GT', NULL),
        ('operador.e103',  'operador.e103@transmetro.gt',  'Operador Estacion El Frutal', 'GT', 'E-L1-03'),
        ('piloto.001',     'piloto001@transmetro.gt',      'Carlos Eduardo Ramirez Lopez', 'GT', NULL),
        ('guardia.001',    'guardia001@transmetro.gt',     'Ana Lucia Castillo Ruiz', 'MIX', NULL)
  ) AS v(username, correo, nombre, muni, estacion_codigo)
  JOIN municipalidad m ON m.codigo = v.muni
  LEFT JOIN estacion e ON e.codigo = v.estacion_codigo;

-- Vinculacion de las cuentas de piloto y guardia con su expediente
UPDATE usuario u
   SET persona_id = p.id
  FROM persona p
 WHERE u.username = 'piloto.001' AND p.dpi = '2547896320101';

UPDATE usuario u
   SET persona_id = p.id
  FROM persona p
 WHERE u.username = 'guardia.001' AND p.dpi = '2874196350108';

INSERT INTO usuario_rol (usuario_id, rol_id)
SELECT u.id, r.id
  FROM (VALUES
        ('admin.general', 'ADMIN_GENERAL'),
        ('admin.muni.gt', 'ADMIN_MUNICIPAL'),
        ('operador.e103', 'OPERADOR_ESTACION'),
        ('piloto.001',    'PILOTO'),
        ('guardia.001',   'GUARDIA')
  ) AS v(username, rol_codigo)
  JOIN usuario u ON u.username = v.username::citext
  JOIN rol r     ON r.codigo = v.rol_codigo;

-- ============================================================================
-- 14. COBERTURA DE GUARDIAS DE HOY  (RF-08)
-- ============================================================================
-- Programacion de la semana: cada guardia cubre un acceso por dia. El reparto
-- deja accesos sin cubrir a proposito, para que la alerta RF-08 tenga casos.
INSERT INTO guardia_asignacion (guardia_id, acceso_id, turno_id, fecha, estado)
SELECT gu.persona_id, ac.id, tu.id, f.dia::date,
       CASE WHEN f.dia::date < CURRENT_DATE THEN 'presente'::estado_cobertura
            ELSE 'programado'::estado_cobertura END
  FROM (SELECT persona_id, row_number() OVER (ORDER BY persona_id) AS rn FROM guardia) gu
  CROSS JOIN generate_series(CURRENT_DATE - 2, CURRENT_DATE + 4, INTERVAL '1 day') AS f(dia)
  JOIN LATERAL (
        SELECT a.id, row_number() OVER (ORDER BY a.id) AS rn
          FROM acceso a
          JOIN estacion e ON e.id = a.estacion_id
         WHERE e.codigo IN ('E-L1-01', 'E-L1-03', 'E-L1-07', 'E-L2-01', 'E-L2-03', 'E-L4-01')
  ) ac ON ac.rn = 1 + ((gu.rn + EXTRACT(DOY FROM f.dia)::int) % 9)
  JOIN LATERAL (
        SELECT t.id, row_number() OVER (ORDER BY t.hora_inicio) AS rn FROM turno t WHERE t.activo
  ) tu ON tu.rn = 1 + (gu.rn % 3)
 ON CONFLICT (guardia_id, fecha, turno_id) DO NOTHING;

-- ============================================================================
-- 15. EQUIPO DE COMPUTO Y CONECTIVIDAD  (RF-11)
-- ============================================================================
INSERT INTO equipo_computo (estacion_id, tipo, marca, modelo, numero_serie,
                            direccion_ip, fecha_instalacion, estado)
SELECT e.id, 'pc', 'Dell', 'OptiPlex 3090',
       'SN-' || e.codigo || '-PC1',
       ('10.20.' || (row_number() OVER (ORDER BY e.id)) || '.10')::inet,
       DATE '2023-01-20', 'operativo'
  FROM estacion e WHERE e.codigo LIKE 'E-L1-%';

INSERT INTO registro_conectividad (estacion_id, equipo_id, estado_enlace,
                                   latencia_ms, ancho_banda_mbps)
SELECT eq.estacion_id, eq.id, 'en_linea', 18, 50.00
  FROM equipo_computo eq;

-- ============================================================================
-- 16. EVALUACION INICIAL DE ALERTAS  (RF-05, RF-06)
-- Los triggers solo reaccionan a cambios; las lineas que arrancan sin
-- unidades asignadas se evaluan explicitamente una vez.
-- ============================================================================
SELECT fn_evaluar_rango_unidades(id) FROM linea;
SELECT fn_evaluar_parqueo_bus(id)    FROM bus;

-- ============================================================================
-- 16. HISTORIAL DE OPERACION DE LAS ULTIMAS 24 HORAS  (RF-09, RF-10)
-- Viajes ya despachados con su medicion de ocupacion, para que el tablero y
-- las graficas tengan contenido desde el primer arranque. La curva reproduce
-- el patron real del servicio: picos de 06:00 a 09:00 y de 17:00 a 20:00.
-- ============================================================================
INSERT INTO viaje (bus_id, linea_id, estacion_origen_id, sentido,
                   fecha_hora_llegada, fecha_hora_salida, ocupacion_salida_pct, estado)
SELECT b.id, bla.linea_id, le.estacion_id,
       CASE WHEN h % 2 = 0 THEN 'ida'::sentido_recorrido ELSE 'vuelta'::sentido_recorrido END,
       date_trunc('hour', now()) - (h || ' hours')::interval + ((b.rn % 6) * 7 || ' minutes')::interval,
       date_trunc('hour', now()) - (h || ' hours')::interval + ((b.rn % 6) * 7 + 6 || ' minutes')::interval,
       v.pct,
       'despachado'
  FROM generate_series(1, 23) AS h
  CROSS JOIN LATERAL (
        SELECT id, rn FROM (
          SELECT id, row_number() OVER (ORDER BY numero_economico) AS rn FROM bus WHERE estado = 'operativo'
        ) t WHERE rn BETWEEN 1 + (h % 5) * 3 AND 3 + (h % 5) * 3
  ) b
  JOIN bus_linea_asignacion bla ON bla.bus_id = b.id AND bla.fecha_fin IS NULL
  JOIN LATERAL (
        SELECT estacion_id FROM linea_estacion
         WHERE linea_id = bla.linea_id AND sentido = 'ida'
         ORDER BY orden_recorrido LIMIT 1
  ) le ON true
  CROSS JOIN LATERAL (
        SELECT CASE
                 -- Hora pico de la manana y de la tarde
                 WHEN EXTRACT(HOUR FROM now() - (h || ' hours')::interval) BETWEEN 6 AND 9  THEN 95 + (b.rn % 7) * 9
                 WHEN EXTRACT(HOUR FROM now() - (h || ' hours')::interval) BETWEEN 17 AND 20 THEN 105 + (b.rn % 6) * 11
                 WHEN EXTRACT(HOUR FROM now() - (h || ' hours')::interval) BETWEEN 22 AND 23 THEN 18 + (b.rn % 4) * 3
                 ELSE 45 + (b.rn % 9) * 5
               END AS pct
  ) v;

INSERT INTO registro_ocupacion (viaje_id, bus_id, estacion_id, fecha_hora,
                                pasajeros_abordo, pasajeros_suben, pasajeros_bajan,
                                capacidad_referencia)
SELECT v.id, v.bus_id, v.estacion_origen_id, v.fecha_hora_llegada,
       round(b.capacidad_total * v.ocupacion_salida_pct / 100.0)::int,
       round(b.capacidad_total * 0.18)::int,
       round(b.capacidad_total * 0.12)::int,
       b.capacidad_total
  FROM viaje v
  JOIN bus b ON b.id = v.bus_id
 WHERE v.estado = 'despachado' AND v.ocupacion_salida_pct IS NOT NULL;

COMMIT;

\echo '>>> 11 Datos iniciales cargados'
\echo '    Usuarios de ejemplo / contrasena: Transmetro2026*'
