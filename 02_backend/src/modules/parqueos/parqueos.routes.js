import { Router } from 'express';
import * as servicio from './parqueos.service.js';
import * as esquema from './parqueos.schema.js';
import { validar } from '../../middlewares/validacion.js';
import { autenticar } from '../../middlewares/autenticacion.js';
import { requiereNivel, resolverAmbito, verificarAmbitoMunicipal } from '../../middlewares/autorizacion.js';
import { MODULOS } from '../../config/permisos.js';
import { asincrono } from '../../utils/asincrono.js';

const router = Router();
const MODULO = MODULOS.FLOTA;

router.use(autenticar, resolverAmbito);

// GET /api/v1/parqueos/predios
router.get(
  '/predios',
  requiereNivel(MODULO, 'L'),
  validar({ query: esquema.listarPrediosQuery }),
  asincrono(async (req, res) => {
    const datos = await servicio.listarPredios({
      municipalidadId: req.query.municipalidadId ?? req.ambito.municipalidadId ?? undefined,
    });
    res.json({ ok: true, datos });
  }),
);

// POST /api/v1/parqueos/predios
router.post(
  '/predios',
  requiereNivel(MODULO, 'E'),
  validar({ body: esquema.crearPredioSchema }),
  asincrono(async (req, res) => {
    verificarAmbitoMunicipal(req, req.body.municipalidadId);
    res.status(201).json({ ok: true, datos: await servicio.crearPredio(req.body, req.usuario.id) });
  }),
);

// GET /api/v1/parqueos/predios/:id/espacios
router.get(
  '/predios/:id/espacios',
  requiereNivel(MODULO, 'L'),
  validar({ params: esquema.idParam, query: esquema.listarEspaciosQuery }),
  asincrono(async (req, res) => {
    const datos = await servicio.listarEspacios(req.params.id, {
      soloDisponibles: req.query.soloDisponibles,
    });
    res.json({ ok: true, datos });
  }),
);

// POST /api/v1/parqueos/predios/:id/espacios  (alta masiva)
router.post(
  '/predios/:id/espacios',
  requiereNivel(MODULO, 'E'),
  validar({ params: esquema.idParam, body: esquema.crearEspaciosSchema }),
  asincrono(async (req, res) => {
    const datos = await servicio.crearEspacios(req.params.id, req.body, req.usuario.id);
    res.status(201).json({ ok: true, datos, total: datos.length });
  }),
);

// GET /api/v1/parqueos/sin-parqueo   (RF-06: bandeja de excepciones)
router.get(
  '/sin-parqueo',
  requiereNivel(MODULO, 'L'),
  asincrono(async (req, res) => {
    const datos = await servicio.unidadesSinParqueo({
      municipalidadId: req.ambito.municipalidadId ?? undefined,
    });
    res.json({ ok: true, datos, total: datos.length });
  }),
);

export default router;
