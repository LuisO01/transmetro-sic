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
const MODULO = MODULOS.LINEAS_ESTACIONES;

router.use(autenticar, resolverAmbito);

const idParam = z.object({ id: z.coerce.number().int().positive() });

const crearSchema = z.object({
  codigo: z.string().min(2).max(10).regex(/^[A-Z0-9]+$/, 'Use solo mayusculas y numeros'),
  nombre: z.string().min(3).max(120),
  departamento: z.string().max(60).default('Guatemala'),
  nit: z.string().max(15).optional(),
  telefono: z.string().max(20).optional(),
  correoContacto: z.string().email().max(120).optional(),
  direccion: z.string().max(250).optional(),
});

/** GET /api/v1/municipalidades — catalogo con su cobertura (RF-13). */
router.get(
  '/',
  requiereNivel(MODULO, 'L'),
  asincrono(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT m.id, m.codigo, m.nombre, m.departamento, m.telefono, m.correo_contacto, m.activo,
              count(DISTINCT e.id)::int AS total_estaciones,
              count(DISTINCT l.id)::int AS total_lineas,
              count(DISTINCT b.id)::int AS total_unidades
         FROM municipalidad m
         LEFT JOIN estacion e ON e.municipalidad_id = m.id
         LEFT JOIN linea    l ON l.municipalidad_id = m.id
         LEFT JOIN bus      b ON b.municipalidad_id = m.id AND b.estado <> 'baja'
        GROUP BY m.id
        ORDER BY m.nombre`,
    );
    res.json({ ok: true, datos: rows });
  }),
);

/** POST /api/v1/municipalidades — solo administracion total. */
router.post(
  '/',
  requiereNivel(MODULOS.SEGURIDAD, 'A'),
  validar({ body: crearSchema }),
  asincrono(async (req, res) => {
    const datos = await enTransaccion(req.usuario.id, async (cliente) => {
      const { rows } = await cliente.query(
        `INSERT INTO municipalidad (codigo, nombre, departamento, nit, telefono, correo_contacto, direccion)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          req.body.codigo, req.body.nombre, req.body.departamento, req.body.nit ?? null,
          req.body.telefono ?? null, req.body.correoContacto ?? null, req.body.direccion ?? null,
        ],
      );
      return rows[0];
    });
    res.status(201).json({ ok: true, datos });
  }),
);

/** GET /api/v1/municipalidades/:id */
router.get(
  '/:id',
  requiereNivel(MODULO, 'L'),
  validar({ params: idParam }),
  asincrono(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM municipalidad WHERE id = $1', [req.params.id]);
    if (rows.length === 0) throw ApiError.noEncontrado('Municipalidad');
    res.json({ ok: true, datos: rows[0] });
  }),
);

export default router;
