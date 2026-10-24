import { Router } from 'express';
import { z } from 'zod';
import * as servicio from './monitoreo.service.js';
import { validar } from '../../middlewares/validacion.js';
import { autenticar } from '../../middlewares/autenticacion.js';
import { requiereNivel, resolverAmbito } from '../../middlewares/autorizacion.js';
import { MODULOS } from '../../config/permisos.js';
import { asincrono } from '../../utils/asincrono.js';
import { ApiError } from '../../utils/errores.js';

const router = Router();
const MODULO = MODULOS.MONITOREO;

router.use(autenticar, resolverAmbito);

const idParam = z.object({ id: z.coerce.number().int().positive() });

// estacionId es opcional: para el operador de estacion lo resuelve el servidor
// a partir de su propia cuenta, de modo que no puede operar sobre otra.
const llegadaSchema = z.object({
  busId: z.number().int().positive(),
  estacionId: z.number().int().positive().optional(),
  pilotoId: z.number().int().positive().optional(),
  sentido: z.enum(['ida', 'vuelta']).default('ida'),
});

const ocupacionSchema = z.object({
  busId: z.number().int().positive(),
  estacionId: z.number().int().positive().optional(),
  viajeId: z.number().int().positive().optional(),
  pasajerosAbordo: z.number().int().min(0).max(500),
  pasajerosSuben: z.number().int().min(0).max(500).optional(),
  pasajerosBajan: z.number().int().min(0).max(500).optional(),
});

/**
 * El operador de estacion solo trabaja sobre su propia estacion. El resto de
 * roles con acceso al modulo debe indicar cual consulta.
 */
function estacionDelUsuario(req, pedida) {
  if (req.ambito.tipo === 'estacion') {
    if (!req.usuario.estacionId) {
      throw ApiError.invalido('Su cuenta no tiene una estacion asignada. Contacte al administrador.');
    }
    if (pedida && Number(pedida) !== Number(req.usuario.estacionId)) {
      throw ApiError.prohibido('Solo puede operar sobre la estacion que tiene asignada.');
    }
    return Number(req.usuario.estacionId);
  }
  return pedida ? Number(pedida) : null;
}

// GET /api/v1/monitoreo/resumen
router.get(
  '/resumen',
  requiereNivel(MODULO, 'L'),
  asincrono(async (req, res) => {
    const estacionId = estacionDelUsuario(req, req.query.estacionId);
    res.json({ ok: true, datos: await servicio.resumenDelDia(estacionId) });
  }),
);

// GET /api/v1/monitoreo/anden
router.get(
  '/anden',
  requiereNivel(MODULO, 'L'),
  asincrono(async (req, res) => {
    const estacionId = estacionDelUsuario(req, req.query.estacionId);
    if (!estacionId) throw ApiError.invalido('Indique la estacion a consultar.');
    res.json({ ok: true, datos: await servicio.anden(estacionId) });
  }),
);

// GET /api/v1/monitoreo/unidades-disponibles
router.get(
  '/unidades-disponibles',
  requiereNivel(MODULO, 'E'),
  asincrono(async (req, res) => {
    const estacionId = estacionDelUsuario(req, req.query.estacionId);
    if (!estacionId) throw ApiError.invalido('Indique la estacion.');
    res.json({ ok: true, datos: await servicio.unidadesDisponibles(estacionId) });
  }),
);

// POST /api/v1/monitoreo/viajes   (registrar llegada al anden)
router.post(
  '/viajes',
  requiereNivel(MODULO, 'E'),
  validar({ body: llegadaSchema }),
  asincrono(async (req, res) => {
    const estacionId = estacionDelUsuario(req, req.body.estacionId);
    if (!estacionId) throw ApiError.invalido('Indique la estacion donde llega la unidad.');
    const datos = await servicio.registrarLlegada({ ...req.body, estacionId }, req.usuario.id);
    res.status(201).json({ ok: true, datos });
  }),
);

// POST /api/v1/monitoreo/ocupacion   (RF-09)
router.post(
  '/ocupacion',
  requiereNivel(MODULO, 'E'),
  validar({ body: ocupacionSchema }),
  asincrono(async (req, res) => {
    const estacionId = estacionDelUsuario(req, req.body.estacionId);
    if (!estacionId) throw ApiError.invalido('Indique la estacion donde se midio la ocupacion.');
    const datos = await servicio.registrarOcupacion({ ...req.body, estacionId }, req.usuario.id);
    res.status(201).json({ ok: true, datos });
  }),
);

// PATCH /api/v1/monitoreo/viajes/:id/despacho   (RF-10)
router.patch(
  '/viajes/:id/despacho',
  requiereNivel(MODULO, 'E'),
  validar({ params: idParam }),
  asincrono(async (req, res) => {
    res.json({ ok: true, datos: await servicio.despachar(req.params.id, req.usuario.id) });
  }),
);

// DELETE /api/v1/monitoreo/viajes/:id   (cancelar la llegada)
router.delete(
  '/viajes/:id',
  requiereNivel(MODULO, 'E'),
  validar({ params: idParam }),
  asincrono(async (req, res) => {
    const datos = await servicio.cancelarViaje(req.params.id, req.body?.motivo, req.usuario.id);
    res.json({ ok: true, datos });
  }),
);

// GET /api/v1/monitoreo/ocupacion
router.get(
  '/ocupacion',
  requiereNivel(MODULO, 'L'),
  asincrono(async (req, res) => {
    const datos = await servicio.ocupacionActual({
      lineaId: req.query.lineaId,
      soloSobrecupo: req.query.soloSobrecupo === 'true',
    });
    res.json({ ok: true, datos });
  }),
);

// GET /api/v1/monitoreo/mis-viajes   (el piloto consulta los suyos)
router.get(
  '/mis-viajes',
  requiereNivel(MODULO, 'E'),
  asincrono(async (req, res) => {
    if (!req.usuario.personaId) {
      throw ApiError.invalido('Su cuenta no esta vinculada a un expediente de piloto.');
    }
    res.json({ ok: true, datos: await servicio.viajesDePiloto(req.usuario.personaId) });
  }),
);

export default router;
