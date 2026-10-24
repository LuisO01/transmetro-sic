import { z } from 'zod';

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const crearAccesoSchema = z.object({
  codigo: z.string().min(1).max(20),
  nombre: z.string().min(3).max(120),
  tipo: z.enum(['peatonal', 'pasarela', 'rampa', 'vehicular', 'emergencia']).default('peatonal'),
  torniquetes: z.number().int().min(0).max(50).default(0),
  // RF-08: cobertura minima exigida por turno
  guardiasMinimos: z.number().int().min(0).max(20).default(1),
  estado: z.enum(['habilitado', 'cerrado', 'mantenimiento']).default('habilitado'),
  observaciones: z.string().max(250).optional(),
});

export const actualizarAccesoSchema = z.object({
  nombre: z.string().min(3).max(120).optional(),
  tipo: z.enum(['peatonal', 'pasarela', 'rampa', 'vehicular', 'emergencia']).optional(),
  torniquetes: z.number().int().min(0).max(50).optional(),
  guardiasMinimos: z.number().int().min(0).max(20).optional(),
  estado: z.enum(['habilitado', 'cerrado', 'mantenimiento']).optional(),
  observaciones: z.string().max(250).optional(),
});
