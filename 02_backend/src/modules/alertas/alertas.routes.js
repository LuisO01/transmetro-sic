import { Router } from 'express';
import { z } from 'zod';
import { pool, enTransaccion } from '../../db/pool.js';
import { validar } from '../../middlewares/validacion.js';
import { autenticar } from '../../middlewares/autenticacion.js';
import { requiereNivel, resolverAmbito } from '../../middlewares/autorizacion.js';
import { MODULOS } from '../../config/permisos.js';
import { asincrono } from '../../utils/asincrono.js';
import { ApiError } from '../../utils/errores.js';

const router = Router();
const MODULO = MODULOS.MONITOREO;

router.use(autenticar, resolverAmbito);

const listarQuery = z.object({
  tipo: z
    .enum([
      'rango_unidades', 'sobrecupo', 'bus_sin_parqueo', 'cobertura_guardias',
      'espera_incumplida', 'conectividad', 'descuadre_conciliacion',
    ])
    .optional(),
  severidad: z.enum(['info', 'advertencia', 'critica']).optional(),
  lineaId: z.coerce.number().int().positive().optional(),
  estacionId: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(200).default(50),
});

const atenderSchema = z.object({
  estado: z.enum(['en_revision', 'cerrada']),
  nota: z.string().max(500).optional(),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

/**
 * GET /api/v1/alertas
 * Bandeja de alertas abiertas generadas por los triggers de la base
 * (RF-05 rango de unidades, RF-06 bus sin parqueo, RF-08 cobertura, RF-09 sobrecupo).
 */
router.get(
  '/',
  requiereNivel(MODULO, 'L'),
  validar({ query: listarQuery }),
  asincrono(async (req, res) => {
    const condiciones = [];
    const valores = [];

    if (req.query.tipo) {
      valores.push(req.query.tipo);
      condiciones.push(`tipo = $${valores.length}`);
    }
    if (req.query.severidad) {
      valores.push(req.query.severidad);
      condiciones.push(`severidad = $${valores.length}`);
    }
    if (req.query.lineaId) {
      valores.push(req.query.lineaId);
      condiciones.push(`linea_codigo IS NOT NULL AND id IN (SELECT id FROM alerta WHERE linea_id = $${valores.length})`);
    }
    if (req.query.estacionId) {
      valores.push(req.query.estacionId);
      condiciones.push(`id IN (SELECT id FROM alerta WHERE estacion_id = $${valores.length})`);
    }
    // El ambito municipal solo ve las alertas de su territorio
    if (req.ambito.municipalidadId) {
      valores.push(req.ambito.municipalidadId);
      condiciones.push(`(municipalidad_ambito IS NULL OR municipalidad_ambito = $${valores.length})`);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    valores.push(req.query.limite);

    const { rows } = await pool.query(
      `SELECT * FROM v_alertas_abiertas
       ${where}
       ORDER BY CASE severidad WHEN 'critica' THEN 1 WHEN 'advertencia' THEN 2 ELSE 3 END,
                generada_en DESC
       LIMIT $${valores.length}`,
      valores,
    );

    res.json({ ok: true, datos: rows, total: rows.length });
  }),
);

/** GET /api/v1/alertas/resumen — conteo por tipo y severidad, para el tablero. */
router.get(
  '/resumen',
  requiereNivel(MODULO, 'L'),
  asincrono(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT tipo, severidad, count(*)::int AS total
         FROM v_alertas_abiertas
        WHERE ($1::bigint IS NULL OR municipalidad_ambito IS NULL OR municipalidad_ambito = $1)
        GROUP BY tipo, severidad
        ORDER BY tipo`,
      [req.ambito.municipalidadId ?? null],
    );
    res.json({ ok: true, datos: rows });
  }),
);

/** PATCH /api/v1/alertas/:id — tomar o cerrar una alerta. */
router.patch(
  '/:id',
  requiereNivel(MODULO, 'E'),
  validar({ params: idParam, body: atenderSchema }),
  asincrono(async (req, res) => {
    const datos = await enTransaccion(req.usuario.id, async (cliente) => {
      const { rows } = await cliente.query(
        `UPDATE alerta
            SET estado        = $2,
                atendida_en   = CASE WHEN $2 = 'cerrada' THEN now() ELSE atendida_en END,
                atendida_por  = $3,
                nota_atencion = COALESCE($4, nota_atencion)
          WHERE id = $1
          RETURNING *`,
        [req.params.id, req.body.estado, req.usuario.id, req.body.nota ?? null],
      );
      if (rows.length === 0) throw ApiError.noEncontrado('Alerta');
      return rows[0];
    });

    res.json({ ok: true, datos });
  }),
);

export default router;
