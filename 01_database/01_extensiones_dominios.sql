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
