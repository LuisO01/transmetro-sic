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
