# Plan de desarrollo por módulos y sprints — Fases F6 a F8

## 1. Criterio de ordenamiento: la matriz de permisos como ruta crítica

La matriz de permisos dice **quién necesita qué**, y con ello ordena el trabajo:

| Rol | Módulos donde escribe (E/A) | Qué implica para el orden |
|---|---|---|
| Administrador general | **A en los 8 módulos** | Sin él nadie más puede existir: crea municipalidades, usuarios y roles. **Va primero, siempre.** |
| Administrador municipal | E en líneas/estaciones, flota, personal, seguridad | Es quien **carga los datos maestros**. Sin su trabajo, los demás roles no tienen sobre qué operar. |
| Operador de estación | E en monitoreo, técnica, pagos | Consume el catálogo ya cargado. **Depende** del administrador municipal. |
| Guardia de seguridad | E en personal (propio) | Depende de que existan accesos y turnos. |
| Piloto | E en monitoreo; L en su expediente | Depende de que existan líneas, unidades y su expediente. |

De ahí la regla que ordena los sprints:

> **Primero se construye lo que un rol necesita *escribir*; después lo que otro rol
> necesita *leer* de eso.** Un módulo solo entra al sprint cuando el catálogo del
> que depende ya está cargado y probado.

Esto evita el error clásico de empezar por las pantallas de monitoreo (las más
vistosas) y descubrir a mitad del proyecto que no hay líneas ni unidades contra
las cuales registrar nada.

---

## 2. Módulos y su mapa de dependencias

```
             SEGURIDAD (RF-15, RF-16)
                     │
                     v
       LINEAS_ESTACIONES (RF-01, RF-02, RF-03, RF-13)
                     │
         ┌───────────┼──────────────┐
         v           v              v
      FLOTA      PERSONAL        TECNICA
  (RF-04..06)  (RF-07, RF-08)    (RF-11)
         │           │              │
         └─────┬─────┘              │
               v                    │
        MONITOREO (RF-09, RF-10)    │
               │                    │
               └────────┬───────────┘
                        v
              PAGOS (RF-12)  →  REPORTERIA (RF-14)
```

`REPORTERIA` va al final porque consolida datos de todos los demás: adelantarla
obliga a rehacerla cada vez que cambia un módulo aguas arriba.

---

## 3. Sprints (2 semanas cada uno)

### Sprint 0 — Cimientos *(1 semana)* ✅ **entregado en este repositorio**

| Entregable | Estado |
|---|---|
| Modelo entidad-relación completo | `docs/01_modelo_entidad_relacion.md` |
| Script SQL de creación (11 archivos, orden de ejecución) | `01_database/` |
| Estructura del backend (Express + PostgreSQL) | `02_backend/` |
| Estructura del frontend (React + Vite) | `03_frontend/` |
| Esquema de autenticación JWT y autorización por matriz | `middlewares/` |
| Endpoints RF-01 a RF-06 | `docs/02_api_endpoints.md` |

**Criterio de cierre:** la base levanta desde cero con `npm run db:reset`, la API
responde `/salud` con la base conectada y el frontend compila sin advertencias.

---

### Sprint 1 — Seguridad y acceso *(RF-15, RF-16)*

**Rol habilitado:** Administrador general.

| Tarea | Detalle |
|---|---|
| Login, refresh, logout | Rotación de refresh tokens; bloqueo tras 5 intentos fallidos |
| CRUD de usuarios y asignación de roles | Con la restricción de que solo un admin general crea otro |
| Pantalla de matriz de permisos | Lectura de `v_permisos_usuario` |
| Bitácora de auditoría consultable | Filtros por usuario, fecha, tabla |
| Cambio de contraseña forzado en primer ingreso | `debe_cambiar_password` |

**Criterios de aceptación**
- Un usuario sin el módulo en su matriz recibe `403`, no una pantalla vacía.
- Todo `INSERT`/`UPDATE`/`DELETE` sobre tablas críticas deja fila en `bitacora_auditoria` con el usuario correcto.
- Las contraseñas se guardan con bcrypt coste 12; ninguna viaja ni se registra en claro.

**Pruebas** — unitarias del middleware `requiereNivel` (matriz 5 roles × 8 módulos
× 3 niveles) e integración de los cuatro endpoints de sesión.

---

### Sprint 2 — Catálogo de red *(RF-01, RF-02, RF-03, RF-13)*

**Rol habilitado:** Administrador municipal.

| Tarea | Detalle |
|---|---|
| CRUD de municipalidades, líneas y estaciones | Con filtro por ámbito municipal |
| Editor de recorrido | Alta, reordenamiento y baja de estaciones por sentido |
| Cálculo de longitud por línea | Derivado, vista `v_linea_longitud` |
| Inventario de accesos por estación | Incluye `guardias_minimos` |
| Carga inicial de datos reales | 7 líneas, 106 estaciones y sus accesos |

**Criterios de aceptación**
- No se puede repetir el orden de recorrido dentro de una línea y sentido.
- La longitud mostrada siempre coincide con la suma de los tramos activos.
- Un administrador municipal no puede crear ni editar estaciones de otra municipalidad.

**Riesgo principal:** la carga de las 106 estaciones es el cuello de botella real
del sprint. Presupueste una importación desde hoja de cálculo, no captura manual.

---

### Sprint 3 — Flota *(RF-04, RF-05, RF-06)*

**Rol habilitado:** Administrador municipal (gestión) y Operador (consulta).

| Tarea | Detalle |
|---|---|
| CRUD de unidades | 210 unidades |
| Asignación de unidad a línea | Con confirmación de reasignación |
| Alerta de rango mínimo/máximo | Trigger + bandeja |
| Predios, espacios y asignación de parqueo | Alta masiva de espacios |
| Bandeja de unidades sin parqueo | Vista `v_buses_sin_parqueo` |

**Criterios de aceptación**
- Dos peticiones simultáneas que asignan el mismo bus a dos líneas: **una falla**
  con `409`. (Probar con dos transacciones concurrentes, no en serie.)
- Bajar una unidad a mantenimiento por debajo del mínimo de la línea abre alerta
  `rango_unidades` en la misma transacción.
- Asignar parqueo a una unidad cierra automáticamente su alerta `bus_sin_parqueo`.

---

### Sprint 4 — Personal *(RF-07, RF-08)*

**Roles habilitados:** Piloto y Guardia de seguridad.

| Tarea | Detalle |
|---|---|
| Expediente de pilotos | Datos personales, licencia, residencia, contacto |
| Historial educativo | Varios niveles por piloto |
| Registro de guardias y turnos | Catálogo de turnos ampliable |
| Programación de cobertura por acceso | Validación contra `guardias_minimos` |
| Vista propia del piloto y del guardia | Solo sus propios registros (ámbito `propio`) |

**Criterios de aceptación**
- Un piloto solo ve su expediente; intentar leer otro devuelve `403`.
- Dejar un acceso habilitado bajo su mínimo abre alerta `cobertura_guardias` con
  el detalle de los turnos descubiertos.
- Un guardia no puede quedar asignado a dos accesos en el mismo turno y fecha.

---

### Sprint 5 — Monitoreo de capacidad y servicio *(RF-09, RF-10)*

**Rol habilitado:** Operador de estación (es su primer módulo de escritura).

| Tarea | Detalle |
|---|---|
| Registro de ocupación por unidad y estación | Pensado para tableta o móvil |
| Cálculo y alerta de sobrecupo (150 %) | Columnas generadas + trigger |
| Registro de llegada y despacho | Regla de espera de 5 minutos |
| Tablero de ocupación en tiempo real | Por línea y estación |

**Criterios de aceptación**
- Despachar una unidad con menos de 25 % de ocupación antes de 5 minutos es
  **imposible**: la base lo rechaza con `ck_viaje_espera_minima`.
- El registro de ocupación es usable desde móvil con una sola mano (es el caso de
  uso real del operador en andén).
- El porcentaje de ocupación se calcula contra la capacidad vigente al momento del
  registro, no contra la capacidad actual de la unidad.

---

### Sprint 6 — Administración técnica y pagos *(RF-11, RF-12)*

| Tarea | Detalle |
|---|---|
| Inventario de equipo de cómputo por estación | Estado y mantenimiento |
| Registro y tablero de conectividad | Semáforo por estación |
| Tarjetas y transacciones | Con hash del número de tarjeta |
| Conciliación diaria por estación | Cálculo automático vs. monto reportado |
| Alerta de descuadre | Tolerancia configurable |

**Criterios de aceptación**
- Reenviar la misma `referencia_externa` no duplica la transacción (idempotencia).
- El número de tarjeta en claro no aparece en la base, ni en los logs, ni en las
  respuestas de la API.
- La conciliación de un día cerrado no se puede reescribir sin dejar rastro en la
  bitácora.

---

### Sprint 7 — Reportería y requisitos no funcionales *(RF-14 y RNF)*

| Tarea | Detalle |
|---|---|
| Reportes consolidados de estaciones, líneas y buses | Sobre las vistas `v_*` |
| Exportación a PDF y Excel | Con marca de clasificación (Decreto 57-2008) |
| Respaldo automático y prueba de restauración | Documentar RPO/RTO |
| Pruebas de carga | Objetivo: respuesta < 3 s bajo carga normal |
| Endurecimiento | HTTPS obligatorio, cabeceras de seguridad, rotación de secretos |

**Criterio de aceptación decisivo:** una restauración real desde respaldo, medida
con cronómetro y documentada. Un plan de recuperación que nunca se ejecutó no es
un plan.

---

### Sprint 8 — Estabilización y cierre

Corrección de defectos, pruebas de aceptación con usuarios reales de cada uno de
los cinco roles, manual de usuario por perfil y documentación de despliegue.

---

## 4. Aseguramiento de la calidad

Al ser el proyecto final del curso de Aseguramiento de la Calidad, conviene que la
estrategia de pruebas sea explícita y trazable a los requerimientos.

### 4.1 Pirámide de pruebas

| Nivel | Qué cubre | Herramienta |
|---|---|---|
| **Restricciones de base** (la base de la pirámide) | RF-04, RF-05, RF-06, RF-08, RF-10: se prueban con `INSERT` que **deben fallar** | pgTAP o scripts SQL con `EXPECT ERROR` |
| **Unitarias** | `nivelSuficiente`, traducción de errores de PostgreSQL, esquemas de zod | Vitest |
| **Integración de API** | Un caso por endpoint, uno por código de error de negocio | Vitest + supertest |
| **Interfaz** | Flujos por rol: login → módulo permitido → acción denegada | Playwright |
| **Carga** | 50 operadores concurrentes registrando ocupación | k6 o Artillery |

### 4.2 Casos de prueba obligatorios por regla de negocio

| Regla | Caso que **debe fallar** | Resultado esperado |
|---|---|---|
| RF-04 | Asignar un bus ya asignado a otra línea | `23P01` / HTTP 409 `BUS_YA_ASIGNADO` |
| RF-04 | Dos transacciones concurrentes asignando el mismo bus | Una hace commit, la otra falla |
| RF-05 | Dejar una línea activa por debajo del mínimo | Alerta `rango_unidades` severidad crítica |
| RF-06 | Asignar dos buses al mismo espacio en el mismo periodo | `23P01` / HTTP 409 |
| RF-08 | Programar menos guardias que el mínimo del acceso | Alerta `cobertura_guardias` |
| RF-09 | Registrar 250 pasajeros en una unidad de capacidad 160 | `sobrecupo = true` + alerta |
| RF-10 | Despachar con 20 % de ocupación a los 3 minutos | `23514` / HTTP 422 `ESPERA_INCUMPLIDA` |
| RF-15 | Operador intentando crear una línea | HTTP 403 `PROHIBIDO` |
| RF-16 | Modificar una línea | Fila en `bitacora_auditoria` con el usuario correcto |

### 4.3 Definición de Terminado (DoD)

Una historia solo se cierra cuando cumple **todo**:

1. Código revisado por un segundo par de ojos.
2. Pruebas automatizadas del nivel que corresponda, en verde.
3. La regla de negocio está garantizada **en la base de datos**, no solo en la API.
4. El endpoint respeta la matriz de permisos y el ámbito de datos del rol.
5. La acción queda registrada en la bitácora si modifica datos críticos.
6. La pantalla es usable en móvil (el operador y el guardia trabajan de pie).
7. Documentación del endpoint actualizada en `docs/02_api_endpoints.md`.

### 4.4 Métricas a reportar en el informe final

- Cobertura de pruebas por módulo (meta: ≥ 70 % en servicios).
- Requerimientos con al menos un caso de prueba automatizado (meta: 100 % de los RF con regla de negocio).
- Defectos encontrados por fase — los hallados en pruebas cuestan menos que los hallados en producción, y esa diferencia es el argumento del informe.
- Tiempo medio de respuesta de los 10 endpoints más usados, contra el RNF de 3 s.

---

## 5. Resumen ejecutivo del calendario

| Sprint | Semanas | Módulos | Rol que queda operativo |
|---|---|---|---|
| 0 | 1 | Cimientos | — |
| 1 | 2 | Seguridad | Administrador general |
| 2 | 2 | Líneas, estaciones, accesos | Administrador municipal |
| 3 | 2 | Flota y parqueos | Administrador municipal (completo) |
| 4 | 2 | Personal | Piloto y Guardia |
| 5 | 2 | Monitoreo | Operador de estación |
| 6 | 2 | Técnica y pagos | Operador de estación (completo) |
| 7 | 2 | Reportería y RNF | Todos |
| 8 | 2 | Estabilización | Todos |

**Total: 17 semanas.** Si el plazo del curso es menor, el recorte sensato es
posponer los sprints 6 y 7 (técnica, pagos y reportería) y entregar un sistema
completo y probado de red + flota + personal + monitoreo, antes que ocho módulos
a medio terminar.
