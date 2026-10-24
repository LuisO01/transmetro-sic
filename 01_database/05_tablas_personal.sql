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
