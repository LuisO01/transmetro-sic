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
