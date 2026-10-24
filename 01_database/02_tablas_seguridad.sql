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
