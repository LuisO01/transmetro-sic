import { z } from 'zod';

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const listarQuery = z.object({
  municipalidadId: z.coerce.number().int().positive().optional(),
  lineaId: z.coerce.number().int().positive().optional(),
  estado: z.enum(['operativo', 'mantenimiento', 'fuera_servicio', 'baja']).optional(),
  sinParqueo: z.coerce.boolean().optional(),
  texto: z.string().max(40).optional(),
  pagina: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(200).optional(),
});

export const crearBusSchema = z.object({
  placa: z.string().min(5).max(10).regex(/^[A-Z0-9-]+$/, 'Use mayusculas, numeros o guion'),
  numeroEconomico: z.string().min(1).max(10),
  municipalidadId: z.number().int().positive(),
  tipo: z.enum(['articulado', 'biarticulado', 'padron', 'alimentador']).default('articulado'),
  marca: z.string().max(60).optional(),
  modelo: z.string().max(60).optional(),
  anio: z.number().int().min(1980).max(2100).optional(),
  capacidadSentados: z.number().int().positive().max(200),
  capacidadPie: z.number().int().min(0).max(300).default(0),
  estado: z.enum(['operativo', 'mantenimiento', 'fuera_servicio', 'baja']).default('operativo'),
  observaciones: z.string().max(250).optional(),
});

export const actualizarBusSchema = crearBusSchema.partial();

/** RF-04: asignacion de la unidad a una unica linea activa. */
export const asignarLineaSchema = z.object({
  lineaId: z.number().int().positive(),
  fechaInicio: z.string().datetime({ offset: true }).optional(),
  motivo: z.string().max(250).optional(),
  // Cierra explicitamente la asignacion vigente antes de crear la nueva
  finalizarVigente: z.boolean().default(false),
});

export const finalizarAsignacionSchema = z.object({
  motivo: z.string().max(250).optional(),
});
