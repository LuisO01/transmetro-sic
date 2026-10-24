import { api } from './cliente.js';

/** Un solo lugar donde se declara la superficie de la API que consume la app. */

export const autenticacion = {
  login: (usuario, password) => api.post('/auth/login', { usuario, password }),
  refrescar: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  perfil: () => api.get('/auth/perfil'),
  cambiarPassword: (datos) => api.patch('/auth/password', datos),
};

export const municipalidades = {
  listar: () => api.get('/municipalidades'),
};

// RF-01, RF-02, RF-05
export const lineas = {
  listar: (filtros) => api.get('/lineas', filtros),
  obtener: (id) => api.get(`/lineas/${id}`),
  crear: (datos) => api.post('/lineas', datos),
  actualizar: (id, datos) => api.patch(`/lineas/${id}`, datos),
  darDeBaja: (id) => api.del(`/lineas/${id}`),
  recorrido: (id, sentido = 'ida') => api.get(`/lineas/${id}/recorrido`, { sentido }),
  agregarTramo: (id, datos) => api.post(`/lineas/${id}/recorrido`, datos),
  actualizarTramo: (id, tramoId, datos) => api.patch(`/lineas/${id}/recorrido/${tramoId}`, datos),
  quitarTramo: (id, tramoId) => api.del(`/lineas/${id}/recorrido/${tramoId}`),
  unidades: (id) => api.get(`/lineas/${id}/unidades`),
};

// RF-01, RF-03, RF-13
export const estaciones = {
  listar: (filtros) => api.get('/estaciones', filtros),
  obtener: (id) => api.get(`/estaciones/${id}`),
  crear: (datos) => api.post('/estaciones', datos),
  actualizar: (id, datos) => api.patch(`/estaciones/${id}`, datos),
  cerrar: (id) => api.del(`/estaciones/${id}`),
  accesos: (id) => api.get(`/estaciones/${id}/accesos`),
  crearAcceso: (id, datos) => api.post(`/estaciones/${id}/accesos`, datos),
};

// RF-03, RF-08
export const accesos = {
  obtener: (id) => api.get(`/accesos/${id}`),
  actualizar: (id, datos) => api.patch(`/accesos/${id}`, datos),
  cerrar: (id) => api.del(`/accesos/${id}`),
  cobertura: (id) => api.get(`/accesos/${id}/cobertura`),
};

// RF-04, RF-06
export const buses = {
  listar: (filtros) => api.get('/buses', filtros),
  obtener: (id) => api.get(`/buses/${id}`),
  crear: (datos) => api.post('/buses', datos),
  actualizar: (id, datos) => api.patch(`/buses/${id}`, datos),
  asignarLinea: (id, datos) => api.post(`/buses/${id}/asignacion`, datos),
  finalizarAsignacion: (id, datos) => api.del(`/buses/${id}/asignacion`, datos ?? {}),
  historial: (id) => api.get(`/buses/${id}/asignaciones`),
  asignarParqueo: (id, datos) => api.post(`/buses/${id}/parqueo`, datos),
  liberarParqueo: (id) => api.del(`/buses/${id}/parqueo`),
};

// RF-06
export const parqueos = {
  predios: (filtros) => api.get('/parqueos/predios', filtros),
  crearPredio: (datos) => api.post('/parqueos/predios', datos),
  espacios: (predioId, filtros) => api.get(`/parqueos/predios/${predioId}/espacios`, filtros),
  crearEspacios: (predioId, datos) => api.post(`/parqueos/predios/${predioId}/espacios`, datos),
  sinParqueo: () => api.get('/parqueos/sin-parqueo'),
};

// RF-05, RF-06, RF-08, RF-09
export const alertas = {
  listar: (filtros) => api.get('/alertas', filtros),
  resumen: () => api.get('/alertas/resumen'),
  atender: (id, datos) => api.patch(`/alertas/${id}`, datos),
};

// Mapa de la red e indicadores del tablero
export const tablero = {
  mapa: () => api.get('/tablero/mapa'),
  indicadores: () => api.get('/tablero/indicadores'),
};

// RF-09, RF-10
export const monitoreo = {
  resumen: () => api.get('/monitoreo/resumen'),
  anden: () => api.get('/monitoreo/anden'),
  unidadesDisponibles: () => api.get('/monitoreo/unidades-disponibles'),
  registrarLlegada: (datos) => api.post('/monitoreo/viajes', datos),
  registrarOcupacion: (datos) => api.post('/monitoreo/ocupacion', datos),
  despachar: (viajeId) => api.patch(`/monitoreo/viajes/${viajeId}/despacho`),
  cancelarViaje: (viajeId, motivo) => api.del(`/monitoreo/viajes/${viajeId}`, { motivo }),
  ocupacionActual: (filtros) => api.get('/monitoreo/ocupacion', filtros),
  misViajes: () => api.get('/monitoreo/mis-viajes'),
};

// RF-07, RF-08
export const personal = {
  resumen: () => api.get('/personal/resumen'),
  pilotos: (filtros) => api.get('/personal/pilotos', filtros),
  expediente: (id) => api.get(`/personal/pilotos/${id}`),
  miExpediente: () => api.get('/personal/mi-expediente'),
  actualizarPiloto: (id, datos) => api.patch(`/personal/pilotos/${id}`, datos),
  agregarEstudio: (id, datos) => api.post(`/personal/pilotos/${id}/educacion`, datos),
  guardias: (filtros) => api.get('/personal/guardias', filtros),
  turnos: () => api.get('/personal/turnos'),
  cobertura: (filtros) => api.get('/personal/cobertura', filtros),
  miCobertura: () => api.get('/personal/mi-cobertura'),
  programarCobertura: (datos) => api.post('/personal/cobertura', datos),
  actualizarCobertura: (id, datos) => api.patch(`/personal/cobertura/${id}`, datos),
  eliminarCobertura: (id) => api.del(`/personal/cobertura/${id}`),
};

// RF-15
export const usuarios = {
  listar: (filtros) => api.get('/usuarios', filtros),
  crear: (datos) => api.post('/usuarios', datos),
  cambiarRoles: (id, roles) => api.put(`/usuarios/${id}/roles`, { roles }),
  cambiarEstado: (id, estado) => api.patch(`/usuarios/${id}/estado`, { estado }),
  matrizPermisos: () => api.get('/usuarios/matriz-permisos'),
};
