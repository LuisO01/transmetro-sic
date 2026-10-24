import { z } from 'zod';

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const listarQuery = z.object({
  municipalidadId: z.coerce.number().int().positive().optional(),
  lineaId: z.coerce.number().int().positive().optional(),
  estado: z.enum(['operativa', 'mantenimiento', 'cerrada']).optional(),
  tipo: z.enum(['troncal', 'transferencia', 'terminal', 'parada']).optional(),
  texto: z.string().max(150).optional(),
  pagina: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(200).optional(),
});

const coordenadas = {
  latitud: z.number().min(13).max(18).optional(),
  longitud: z.number().min(-93).max(-88).optional(),
};

export const crearEstacionSchema = z
  .object({
    codigo: z.string().min(1).max(15).regex(/^[A-Z0-9-]+$/, 'Use mayusculas, numeros o guion'),
    nombre: z.string().min(3).max(150),
    municipalidadId: z.number().int().positive(),
    tipo: z.enum(['troncal', 'transferencia', 'terminal', 'parada']).default('troncal'),
    ...coordenadas,
    capacidadPersonas: z.number().int().positive().max(100000).default(100),
    direccionReferencia: z.string().max(250).optional(),
    estado: z.enum(['operativa', 'mantenimiento', 'cerrada']).default('operativa'),
  })
  .refine((d) => (d.latitud === undefined) === (d.longitud === undefined), {
    message: 'Latitud y longitud deben enviarse juntas',
    path: ['longitud'],
  });

export const actualizarEstacionSchema = z.object({
  nombre: z.string().min(3).max(150).optional(),
  municipalidadId: z.number().int().positive().optional(),
  tipo: z.enum(['troncal', 'transferencia', 'terminal', 'parada']).optional(),
  ...coordenadas,
  capacidadPersonas: z.number().int().positive().max(100000).optional(),
  direccionReferencia: z.string().max(250).optional(),
  estado: z.enum(['operativa', 'mantenimiento', 'cerrada']).optional(),
});
