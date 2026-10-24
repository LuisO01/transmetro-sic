/** Debe mantenerse sincronizado con 02_backend/src/config/permisos.js. */

export const MODULOS = Object.freeze({
  LINEAS_ESTACIONES: 'LINEAS_ESTACIONES',
  FLOTA: 'FLOTA',
  PERSONAL: 'PERSONAL',
  MONITOREO: 'MONITOREO',
  TECNICA: 'TECNICA',
  PAGOS: 'PAGOS',
  REPORTERIA: 'REPORTERIA',
  SEGURIDAD: 'SEGURIDAD',
});

export const ETIQUETA_MODULO = Object.freeze({
  LINEAS_ESTACIONES: 'Lineas y estaciones',
  FLOTA: 'Flota',
  PERSONAL: 'Personal',
  MONITOREO: 'Monitoreo',
  TECNICA: 'Administracion tecnica',
  PAGOS: 'Conciliacion de pagos',
  REPORTERIA: 'Reporteria',
  SEGURIDAD: 'Seguridad',
});

export const ETIQUETA_NIVEL = Object.freeze({
  L: 'Lectura',
  E: 'Escritura',
  A: 'Administracion total',
});

export const ETIQUETA_ALERTA = Object.freeze({
  rango_unidades: 'Unidades fuera de rango (RF-05)',
  sobrecupo: 'Sobrecupo (RF-09)',
  bus_sin_parqueo: 'Unidad sin parqueo (RF-06)',
  cobertura_guardias: 'Cobertura de guardias (RF-08)',
  espera_incumplida: 'Espera de 5 minutos (RF-10)',
  conectividad: 'Conectividad (RF-11)',
  descuadre_conciliacion: 'Descuadre de conciliacion (RF-12)',
});

export const SITUACION_LINEA = Object.freeze({
  en_rango: { texto: 'En rango', tono: 'ok' },
  bajo_minimo: { texto: 'Bajo el minimo', tono: 'critico' },
  sobre_maximo: { texto: 'Sobre el maximo', tono: 'aviso' },
  sin_evaluar: { texto: 'Sin evaluar', tono: 'neutro' },
});
