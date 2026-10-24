import { z } from 'zod';

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const listarPrediosQuery = z.object({
  municipalidadId: z.coerce.number().int().positive().optional(),
});

export const listarEspaciosQuery = z.object({
  soloDisponibles: z.coerce.boolean().optional(),
});

export const crearPredioSchema = z.object({
  codigo: z.string().min(1).max(15),
  nombre: z.string().min(3).max(120),
  municipalidadId: z.number().int().positive(),
  direccion: z.string().max(250).optional(),
  capacidad: z.number().int().positive().max(5000),
});

export const crearEspaciosSchema = z.object({
  codigos: z.array(z.string().min(1).max(15)).min(1).max(500),
  tipoPermitido: z.enum(['articulado', 'biarticulado', 'padron', 'alimentador']).optional(),
});

/** RF-06: ningun bus operativo debe quedar sin parqueo. */
export const asignarParqueoSchema = z.object({
  espacioId: z.number().int().positive(),
  fechaInicio: z.string().datetime({ offset: true }).optional(),
  motivo: z.string().max(250).optional(),
  liberarVigente: z.boolean().default(false),
});
