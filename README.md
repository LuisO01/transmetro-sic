# SIC Transmetro

Sistema de Información y Control para las líneas del Transmetro de la Ciudad de
Guatemala y municipios aledaños — 7 líneas, 106 estaciones, 210 unidades.

Centraliza en una sola base de datos la información hoy dispersa entre
municipalidades y operadores, y automatiza en la propia base las reglas de
negocio que hoy dependen del control manual.

Proyecto final del curso de Aseguramiento de la Calidad del Software.
Universidad Mariano Gálvez de Guatemala, Facultad de Ingeniería en Sistemas.
Luis Orozco, carné 3590 22 5339.

**Estado:** 12 módulos con interfaz, 75 puntos de acceso REST, 33 tablas y
12 de los 16 requerimientos funcionales en funcionamiento. Los entregables en
PDF están en [`entregables/`](entregables).

---

## Estructura del repositorio

```
transmetro-sic/
├── entregables/                        Documentos PDF, diagramas y script consolidado
├── docs/
│   ├── 01_modelo_entidad_relacion.md   Entidades, atributos, cardinalidades
│   ├── 02_api_endpoints.md             Contrato de la API REST
│   └── 03_plan_sprints.md              Plan de sprints y estrategia de QA
├── 01_database/                        Scripts SQL en orden de ejecución
│   ├── 00_drop_all.sql                 Solo desarrollo
│   ├── 01_extensiones_dominios.sql     Esquema, extensiones, tipos ENUM
│   ├── 02_tablas_seguridad.sql         Municipalidad, roles, usuarios, bitácora
│   ├── 03_tablas_red.sql               Líneas, estaciones, recorrido, accesos
│   ├── 04_tablas_flota.sql             Buses, asignaciones, parqueos
│   ├── 05_tablas_personal.sql          Personas, pilotos, guardias, coberturas
│   ├── 06_tablas_operacion.sql         Viajes, ocupación, alertas, equipo
│   ├── 07_tablas_pagos.sql             Tarjetas, transacciones, conciliación
│   ├── 08_reglas_negocio.sql           Funciones y triggers de negocio
│   ├── 09_indices.sql                  Índices de rendimiento
│   ├── 10_vistas.sql                   Vistas de consulta y reportes
│   └── 11_seed.sql                     Catálogos + datos de ejemplo
├── 02_backend/                         API REST (Node.js + Express + pg)
│   └── src/
│       ├── config/                     Variables de entorno y catálogo de permisos
│       ├── db/                         Pool y transacciones con contexto de usuario
│       ├── middlewares/                Autenticación, autorización, validación, errores
│       ├── modules/<modulo>/           *.service.js · *.schema.js · *.routes.js
│       ├── utils/                      Errores de negocio y utilidades
│       ├── app.js · routes.js · server.js
└── 03_frontend/                        Aplicación web (React + Vite)
    └── src/
        ├── api/                        Cliente HTTP y superficie de endpoints
        ├── components/                 Componentes reutilizables
        ├── hooks/                      useRecurso (cargando / datos / error)
        ├── layouts/ · pages/ · router/ Navegación y pantallas
        ├── store/                      Contexto de autenticación y permisos
        └── styles/                     Hoja de estilos responsiva
```

---

## Puesta en marcha

### 1. Base de datos

Cree una instancia de PostgreSQL 14 o superior (servicio administrado en la nube)
y aplique los scripts en orden:

```bash
cd 02_backend
cp .env.example .env        # complete DATABASE_URL y los secretos
npm install
npm run db:reset            # aplica 00 (drop) y luego 01..11
```

Si prefiere `psql`:

```bash
for f in 01_database/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
```

Genere los secretos de JWT con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 2. API

```bash
cd 02_backend
npm run dev                 # http://localhost:4000
```

Verificación: `GET http://localhost:4000/salud` debe responder
`"baseDatos": "conectada"`.

### 3. Frontend

```bash
cd 03_frontend
npm install
npm run dev                 # http://localhost:5174
```

Vite reenvía `/api` al backend, así que no hay que configurar CORS en desarrollo.

### 4. Usuarios de ejemplo

Los crea `11_seed.sql`. Contraseña de todos: `Transmetro2026*`
(el sistema exige cambiarla en el primer ingreso).

| Usuario | Rol |
|---|---|
| `admin.general` | Administrador general |
| `admin.muni.gt` | Administrador municipal |
| `operador.e103` | Operador de estación |
| `piloto.001` | Piloto |
| `guardia.001` | Guardia de seguridad |

---

## Decisiones de diseño que conviene conocer

### Las reglas de negocio viven en la base de datos

No en la API. La API traduce el error a un mensaje entendible, pero la garantía
está en PostgreSQL, donde ningún cliente — la aplicación web, un script de carga
o una consulta manual — puede saltársela:

| Regla | Mecanismo |
|---|---|
| RF-04 Un bus en una sola línea activa | `EXCLUDE USING gist` sobre `(bus_id, tstzrange)` + índice único parcial |
| RF-06 Un espacio, un bus; un bus, un espacio | Dos restricciones `EXCLUDE` |
| RF-10 Espera de 5 minutos bajo 25 % de ocupación | `CHECK ck_viaje_espera_minima` |
| RF-09 Sobrecupo al 150 % | Columnas `GENERATED` + trigger de alerta |
| RF-05 Rango de unidades por línea | Trigger `tg_asignacion_rango_unidades` |
| RF-08 Cobertura mínima de guardias | Trigger `tg_cobertura_guardias` |
| RF-16 Bitácora | Trigger genérico `fn_auditoria()` sobre 14 tablas |

### Los datos derivados no se almacenan

La longitud de una línea es la suma de las distancias entre sus estaciones
(vista `v_linea_longitud`), no una columna que haya que recordar actualizar.
Lo mismo con el porcentaje de ocupación y la diferencia de conciliación, que son
columnas generadas.

### La matriz de permisos es una tabla, no código

`rol_permiso (rol, modulo, nivel)` es la matriz del documento de requerimientos
normalizada. La API la lee al iniciar sesión mediante `v_permisos_usuario` y la
embebe en el token; el frontend la usa para armar el menú y ocultar botones, y la
API la vuelve a verificar en cada petición. Cambiar un permiso es un `UPDATE`, no
un despliegue.

### El usuario de la sesión llega hasta la base

Cada transacción hace `SET LOCAL app.usuario_id`, de donde lo toman los triggers
de auditoría y las columnas de trazabilidad. Así la bitácora registra a la persona
real, no al usuario técnico de la conexión.

---

---

## Ejecutar el sistema completo sin instalar PostgreSQL

Para demostraciones y desarrollo, el proyecto incluye una base PostgreSQL real
(PGlite, el motor compilado a WebAssembly) que se expone en un puerto TCP. No
requiere instalar ni configurar un servidor.

Tres terminales:

```bash
# 1. Base de datos en el puerto 5433 (la primera vez aplica todo 01_database)
cd 02_backend && npm run db:local

# 2. API en el puerto 4000
cd 02_backend && npm run dev

# 3. Aplicacion web en el puerto 5174
cd 03_frontend && npm run dev
```

Luego abrir http://localhost:5174 e ingresar con `admin.general` y la
contrasena `Transmetro2026*`.

`npm run db:local:reset` borra los datos y vuelve a aplicar el script completo.
Los datos viven en `02_backend/.datos-pglite`.

**Importante:** PGlite atiende una conexion a la vez, por lo que en este modo
`DB_POOL_MAX` debe valer 1. Contra un PostgreSQL real se sube a 10.

---

## Estado de verificación

| Elemento | Estado |
|---|---|
| Los 12 scripts SQL | Validados con el analizador sintáctico oficial de PostgreSQL (`pg-query-emscripten`): 235 sentencias sin errores |
| Frontend | `npm run build` compila sin advertencias |
| Backend | 9 pruebas de autenticación y matriz de permisos en verde (`npm test`) |
| Ejecución del DDL contra un servidor real | **Hecho**: el script corre completo, dos veces seguidas, sobre PostgreSQL 18.3. Las reglas RF-04, RF-05, RF-06, RF-08, RF-09, RF-10 y RF-16 se probaron con datos válidos e inválidos |
| Sistema completo en ejecución | **Hecho**: base, API y aplicación web funcionando juntas. Se verificaron 38 casos de prueba (CP-01 a CP-38), incluidos el andén con la regla de los 5 minutos, el sobrecupo, el expediente propio del piloto y la cobertura del guardia |
| Pendiente conocido | Los casos de monitoreo y personal (CP-27 a CP-38) se ejecutaron de forma manual; su automatización es la primera tarea del sprint siguiente |

---

## Trazabilidad de requerimientos

| RF | Base de datos | API | Frontend |
|---|---|---|---|
| RF-01 Catálogo | `linea`, `estacion`, `linea_estacion` | `/lineas`, `/estaciones` | Líneas, Estaciones |
| RF-02 Distancias | `v_linea_longitud` | `/lineas/:id/recorrido` | Detalle de línea |
| RF-03 Accesos | `acceso` | `/estaciones/:id/accesos` | Detalle de estación |
| RF-04 Bus–línea | `bus_linea_asignacion` + `EXCLUDE` | `/buses/:id/asignacion` | Flota |
| RF-05 Rango de unidades | trigger + `alerta` | `/alertas` | Tablero, Alertas |
| RF-06 Parqueos | `parqueo_*` + `EXCLUDE` | `/parqueos`, `/buses/:id/parqueo` | Parqueos, Flota |
| RF-07 Expediente de piloto | `persona`, `piloto`, `piloto_educacion` | `/personal/pilotos`, `/personal/mi-expediente` | Personal, Mi expediente |
| RF-08 Cobertura de guardias | `guardia_asignacion` + trigger | `/personal/cobertura`, `/personal/mi-cobertura` | Personal, Mi cobertura |
| RF-09 Ocupación y sobrecupo | `registro_ocupacion` (`GENERATED`) | `/monitoreo/ocupacion`, `/tablero/indicadores` | Monitoreo, Tablero |
| RF-10 Espera de 5 minutos | `CHECK ck_viaje_espera_minima` | `/monitoreo/anden`, `/monitoreo/despachar` | Monitoreo |
| RF-11, RF-12, RF-14 | Tablas y vistas creadas | Pendiente de interfaz | Pendiente de interfaz |
| RF-13 Municipalidad responsable | `municipalidad` en línea y estación | `/municipalidades` | Líneas, Estaciones |
| RF-15 Usuarios y roles | `rol_permiso`, `v_permisos_usuario` | `/usuarios` | Usuarios |
| RF-16 Bitácora | `bitacora_auditoria` + `fn_auditoria()` | — | Pendiente de interfaz |

El detalle completo está en [docs/01_modelo_entidad_relacion.md](docs/01_modelo_entidad_relacion.md),
[docs/02_api_endpoints.md](docs/02_api_endpoints.md) y
[docs/03_plan_sprints.md](docs/03_plan_sprints.md).
