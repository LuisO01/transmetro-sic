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
