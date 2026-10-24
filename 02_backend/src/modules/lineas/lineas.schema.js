import { z } from 'zod';

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const listarQuery = z.object({
  municipalidadId: z.coerce.number().int().positive().optional(),
  estado: z.enum(['planificada', 'activa', 'suspendida', 'baja']).optional(),
  texto: z.string().max(120).optional(),
  pagina: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(200).optional(),
});

export const crearLineaSchema = z
  .object({
    codigo: z.string().min(1).max(10).regex(/^[A-Z0-9-]+$/, 'Use mayusculas, numeros o guion'),
    nombre: z.string().min(3).max(120),
    colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Formato #RRGGBB').default('#0057B8'),
    tipo: z.enum(['troncal', 'alimentadora', 'expres']).default('troncal'),
    municipalidadId: z.number().int().positive(),
    unidadesMinimas: z.number().int().min(1),
    unidadesMaximas: z.number().int().min(1),
    estado: z.enum(['planificada', 'activa', 'suspendida', 'baja']).default('planificada'),
    fechaInicioOperacion: z.string().date().optional(),
    observaciones: z.string().max(500).optional(),
  })
  // RF-05: se valida tambien aqui para devolver un mensaje claro antes de tocar la base
  .refine((d) => d.unidadesMaximas >= d.unidadesMinimas, {
    message: 'El maximo de unidades no puede ser menor que el minimo',
    path: ['unidadesMaximas'],
  });

export const actualizarLineaSchema = z
  .object({
    nombre: z.string().min(3).max(120).optional(),
    colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    tipo: z.enum(['troncal', 'alimentadora', 'expres']).optional(),
    municipalidadId: z.number().int().positive().optional(),
    unidadesMinimas: z.number().int().min(1).optional(),
    unidadesMaximas: z.number().int().min(1).optional(),
    estado: z.enum(['planificada', 'activa', 'suspendida', 'baja']).optional(),
    fechaInicioOperacion: z.string().date().optional(),
    observaciones: z.string().max(500).optional(),
  })
  .refine(
    (d) => d.unidadesMinimas === undefined
      || d.unidadesMaximas === undefined
      || d.unidadesMaximas >= d.unidadesMinimas,
    { message: 'El maximo de unidades no puede ser menor que el minimo', path: ['unidadesMaximas'] },
  );

export const sentidoQuery = z.object({
  sentido: z.enum(['ida', 'vuelta']).default('ida'),
});

export const agregarTramoSchema = z.object({
  estacionId: z.number().int().positive(),
  sentido: z.enum(['ida', 'vuelta']).default('ida'),
  ordenRecorrido: z.number().int().min(1),
  distanciaKmSiguiente: z.number().positive().max(999).optional(),
  tiempoEstimadoMin: z.number().int().positive().max(500).optional(),
});

export const actualizarTramoSchema = z.object({
  ordenRecorrido: z.number().int().min(1).optional(),
  distanciaKmSiguiente: z.number().positive().max(999).optional(),
  tiempoEstimadoMin: z.number().int().positive().max(500).optional(),
  activo: z.boolean().optional(),
});

export const tramoParam = z.object({
  id: z.coerce.number().int().positive(),
  tramoId: z.coerce.number().int().positive(),
});
