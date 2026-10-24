# API REST — SIC Transmetro

Base: `/api/v1` · Formato: JSON · Autenticación: `Authorization: Bearer <accessToken>`

Toda respuesta correcta tiene la forma:

```json
{ "ok": true, "datos": { } }
```

y los listados agregan `total`, `pagina`, `limite` junto a `items`.

Todo error tiene la forma:

```json
{
  "ok": false,
  "error": { "codigo": "BUS_YA_ASIGNADO", "mensaje": "...", "detalle": { } }
}
```

---

## 1. Autenticación y sesión

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| POST | `/auth/login` | público | Devuelve `accessToken` (15 min), `refreshToken` (8 h) y el perfil con sus permisos efectivos. Límite de 10 intentos por 15 min. |
| POST | `/auth/refresh` | público | Rota el refresh token; el anterior queda revocado. |
| POST | `/auth/logout` | autenticado | Revoca el refresh token y escribe `LOGOUT` en la bitácora. |
| GET | `/auth/perfil` | autenticado | Perfil, roles, ámbito y matriz de permisos vigente. |
| PATCH | `/auth/password` | autenticado | Cambia la contraseña e invalida todas las sesiones abiertas. |

**Esquema de autorización.** El access token lleva `permisos` como un mapa
`{ MODULO: 'L' | 'E' | 'A' }` calculado con la vista `v_permisos_usuario`, y
`ambito` (`propio` | `estacion` | `municipal` | `global`). Cada ruta declara el
nivel mínimo que exige con `requiereNivel(MODULO, nivel)`; el ámbito acota además
*qué filas* puede ver o tocar el usuario (un administrador municipal solo escribe
sobre su municipalidad).

---

## 2. RF-01 · Catálogo de líneas y estaciones

| Método | Ruta | Módulo / nivel | RF |
|---|---|---|---|
| GET | `/lineas` | LINEAS_ESTACIONES · L | RF-01 |
| GET | `/lineas/:id` | LINEAS_ESTACIONES · L | RF-01 |
| POST | `/lineas` | LINEAS_ESTACIONES · **E** | RF-01, RF-05 |
| PATCH | `/lineas/:id` | LINEAS_ESTACIONES · **E** | RF-01, RF-05 |
| DELETE | `/lineas/:id` | LINEAS_ESTACIONES · **A** | baja lógica |
| GET | `/estaciones` | LINEAS_ESTACIONES · L | RF-01, RF-13 |
| GET | `/estaciones/:id` | LINEAS_ESTACIONES · L | RF-01, RF-03 |
| POST | `/estaciones` | LINEAS_ESTACIONES · **E** | RF-01, RF-13 |
| PATCH | `/estaciones/:id` | LINEAS_ESTACIONES · **E** | RF-01 |
| DELETE | `/estaciones/:id` | LINEAS_ESTACIONES · **A** | cierre lógico |
| GET | `/municipalidades` | LINEAS_ESTACIONES · L | RF-13 |
| POST | `/municipalidades` | SEGURIDAD · **A** | RF-13 |

Filtros de `/lineas`: `estado`, `municipalidadId`, `texto`, `pagina`, `limite`.
Filtros de `/estaciones`: `municipalidadId`, `lineaId`, `estado`, `tipo`, `texto`.

**Ejemplo — crear línea**

```http
POST /api/v1/lineas
{
  "codigo": "L8",
  "nombre": "Linea 8 - Eje Periferico",
  "municipalidadId": 1,
  "tipo": "troncal",
  "unidadesMinimas": 18,
  "unidadesMaximas": 30,
  "colorHex": "#0057B8"
}
```

---

## 3. RF-02 · Recorrido, distancias y longitud total

| Método | Ruta | Nivel | Nota |
|---|---|---|---|
| GET | `/lineas/:id/recorrido?sentido=ida` | L | Devuelve las estaciones en orden, la distancia a la siguiente, la estación siguiente y `longitudKm` como suma de tramos. |
| POST | `/lineas/:id/recorrido` | **E** | Agrega una estación al recorrido con su orden y distancia. |
| PATCH | `/lineas/:id/recorrido/:tramoId` | **E** | Corrige orden, distancia o tiempo. |
| DELETE | `/lineas/:id/recorrido/:tramoId` | **E** | Quita la estación del recorrido. |

La longitud **no se almacena**: se deriva de `linea_estacion.distancia_km_siguiente`
(vista `v_linea_longitud`), de modo que no puede quedar desincronizada.

**Respuesta**

```json
{
  "ok": true,
  "datos": {
    "linea": { "id": 1, "codigo": "L1", "nombre": "Linea 1 - Eje Sur" },
    "sentido": "ida",
    "totalEstaciones": 10,
    "longitudKm": 8.38,
    "tiempoEstimadoMin": 28,
    "estaciones": [
      {
        "orden_recorrido": 1,
        "estacion_codigo": "E-L1-01",
        "estacion_nombre": "Terminal Sur",
        "distancia_km_siguiente": "0.850",
        "estacion_siguiente": "Plaza Comercial Sur"
      }
    ]
  }
}
```

---

## 4. RF-03 · Inventario de accesos

| Método | Ruta | Nivel |
|---|---|---|
| GET | `/estaciones/:id/accesos` | L |
| POST | `/estaciones/:id/accesos` | **E** |
| GET | `/accesos/:id` | L |
| PATCH | `/accesos/:id` | **E** |
| DELETE | `/accesos/:id` | **A** |
| GET | `/accesos/:id/cobertura` | PERSONAL · L (RF-08) |

Cada acceso lleva `guardiasMinimos`, que es la base de la validación de
cobertura del RF-08. Al modificarlo, la API vuelve a evaluar la cobertura del
día y abre o cierra la alerta correspondiente.

---

## 5. RF-04 · Un bus, una sola línea activa

| Método | Ruta | Nivel | Descripción |
|---|---|---|---|
| GET | `/buses` | FLOTA · L | Filtros: `lineaId`, `estado`, `sinParqueo`, `texto`. |
| GET | `/buses/:id` | FLOTA · L | Incluye línea vigente y parqueo vigente. |
| POST | `/buses` | FLOTA · **E** | |
| PATCH | `/buses/:id` | FLOTA · **E** | |
| POST | `/buses/:id/asignacion` | FLOTA · **E** | Asigna la unidad a una línea. |
| DELETE | `/buses/:id/asignacion` | FLOTA · **E** | Cierra la asignación vigente. |
| GET | `/buses/:id/asignaciones` | FLOTA · L | Historial completo. |
| GET | `/lineas/:id/unidades` | FLOTA · L | Unidades de la línea y situación frente al rango. |

**La regla se aplica en tres capas:**

1. **Base de datos** — `EXCLUDE USING gist (bus_id WITH =, tstzrange(...) WITH &&)`
   impide cualquier traslape, más un índice único parcial sobre las asignaciones
   vigentes. Es la garantía real: ninguna ruta puede saltársela.
2. **API** — lee la asignación vigente con `FOR UPDATE` y devuelve
   `409 BUS_YA_ASIGNADO` con el código de la línea actual.
3. **Interfaz** — ofrece confirmar la reasignación; al aceptar, envía
   `finalizarVigente: true` y la API cierra la anterior y abre la nueva en la
   misma transacción.

```http
POST /api/v1/buses/12/asignacion
{ "lineaId": 3, "motivo": "Refuerzo hora pico", "finalizarVigente": true }
```

Error cuando ya existe asignación y no se confirmó:

```json
{
  "ok": false,
  "error": {
    "codigo": "BUS_YA_ASIGNADO",
    "mensaje": "La unidad TM-012 esta asignada a la linea L1. Envie \"finalizarVigente\": true para reasignarla (RF-04).",
    "detalle": { "asignacionVigenteId": 45, "lineaActual": "L1" }
  }
}
```

---

## 6. RF-05 · Alerta por rango de unidades

No tiene endpoint propio de "disparo": la alerta la genera la base con el trigger
`tg_asignacion_rango_unidades` cada vez que cambia una asignación o el estado de
una unidad. La API la expone como bandeja:

| Método | Ruta | Nivel |
|---|---|---|
| GET | `/alertas` | MONITOREO · L |
| GET | `/alertas/resumen` | MONITOREO · L |
| PATCH | `/alertas/:id` | MONITOREO · **E** |

Filtros de `/alertas`: `tipo`, `severidad`, `lineaId`, `estacionId`, `limite`.
Tipos: `rango_unidades`, `sobrecupo`, `bus_sin_parqueo`, `cobertura_guardias`,
`espera_incumplida`, `conectividad`, `descuadre_conciliacion`.

Además, `GET /lineas` y `GET /lineas/:id/unidades` devuelven `situacion`:
`en_rango` | `bajo_minimo` | `sobre_maximo` | `sin_evaluar`.

---

## 7. RF-06 · Parqueos

| Método | Ruta | Nivel | Descripción |
|---|---|---|---|
| GET | `/parqueos/predios` | FLOTA · L | Predios con ocupación. |
| POST | `/parqueos/predios` | FLOTA · **E** | |
| GET | `/parqueos/predios/:id/espacios` | FLOTA · L | `?soloDisponibles=true`. |
| POST | `/parqueos/predios/:id/espacios` | FLOTA · **E** | Alta masiva por lista de códigos. |
| GET | `/parqueos/sin-parqueo` | FLOTA · L | **Bandeja de excepciones:** unidades operativas sin parqueo vigente. |
| POST | `/buses/:id/parqueo` | FLOTA · **E** | Asigna espacio (`liberarVigente` para trasladar). |
| DELETE | `/buses/:id/parqueo` | FLOTA · **E** | Libera el espacio. |

Garantías en la base: dos restricciones `EXCLUDE` (un espacio no aloja dos buses;
un bus no ocupa dos espacios) y el trigger `fn_evaluar_parqueo_bus`, que abre la
alerta `bus_sin_parqueo` en cuanto una unidad operativa se queda sin espacio y la
cierra sola cuando se le asigna uno.

---

## 8. RF-15 · Usuarios y roles

| Método | Ruta | Nivel |
|---|---|---|
| GET | `/usuarios` | SEGURIDAD · **E** |
| POST | `/usuarios` | SEGURIDAD · **E** |
| PUT | `/usuarios/:id/roles` | SEGURIDAD · **E** |
| PATCH | `/usuarios/:id/estado` | SEGURIDAD · **E** |
| GET | `/usuarios/matriz-permisos` | SEGURIDAD · **E** |

Reglas adicionales: un administrador municipal solo ve y gestiona usuarios de su
municipalidad, y **no puede** crear ni otorgar el rol `ADMIN_GENERAL`.

---

## 9. Operación y salud

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/salud` | Sonda que verifica la conexión a la base y reporta latencia (RNF de disponibilidad). |

---

## 10. Códigos de error de negocio

| Código | HTTP | Origen |
|---|---|---|
| `VALIDACION` | 400 | zod, antes de tocar la base |
| `NO_AUTENTICADO` | 401 | token ausente, inválido o expirado |
| `PROHIBIDO` | 403 | nivel insuficiente o fuera de ámbito |
| `NO_ENCONTRADO` | 404 | |
| `BUS_YA_ASIGNADO` | 409 | RF-04 |
| `ESPACIO_OCUPADO` / `BUS_YA_PARQUEADO` | 409 | RF-06 |
| `GUARDIA_OCUPADO` | 409 | RF-08 |
| `ORDEN_DUPLICADO` / `ESTACION_DUPLICADA` | 409 | RF-01 |
| `LINEA_CON_UNIDADES` | 409 | baja de línea con flota asignada |
| `ESPERA_INCUMPLIDA` | 422 | RF-10 (`CHECK ck_viaje_espera_minima`) |
| `RANGO_INVALIDO` | 422 | RF-05 (máximo menor que mínimo) |
| `DEMASIADOS_INTENTOS` | 429 | límite de peticiones |
| `ERROR_INTERNO` | 500 | |

Los códigos 409 y 422 provienen de restricciones reales de PostgreSQL
(`23505`, `23514`, `23P01`) traducidas en `src/utils/errores.js`: la regla vive en
la base y la API solo le pone nombre y mensaje.
