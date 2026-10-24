import { Router } from 'express';
import * as servicio from './buses.service.js';
import * as esquema from './buses.schema.js';
import * as parqueos from '../parqueos/parqueos.service.js';
import * as parqueosEsquema from '../parqueos/parqueos.schema.js';
import { validar } from '../../middlewares/validacion.js';
import { autenticar } from '../../middlewares/autenticacion.js';
import { requiereNivel, resolverAmbito, verificarAmbitoMunicipal } from '../../middlewares/autorizacion.js';
import { MODULOS } from '../../config/permisos.js';
import { asincrono, paginacion } from '../../utils/asincrono.js';

const router = Router();
const MODULO = MODULOS.FLOTA;

router.use(autenticar, resolverAmbito);

// GET /api/v1/buses
router.get(
  '/',
  requiereNivel(MODULO, 'L'),
  validar({ query: esquema.listarQuery }),
  asincrono(async (req, res) => {
    const { limite, desplazamiento, pagina } = paginacion(req.query);
    const datos = await servicio.listar({
      municipalidadId: req.query.municipalidadId ?? req.ambito.municipalidadId ?? undefined,
      lineaId: req.query.lineaId,
      estado: req.query.estado,
      sinParqueo: req.query.sinParqueo,
      texto: req.query.texto,
      limite,
      desplazamiento,
    });
    res.json({ ok: true, ...datos, pagina, limite });
  }),
);

// GET /api/v1/buses/:id
router.get(
  '/:id',
  requiereNivel(MODULO, 'L'),
  validar({ params: esquema.idParam }),
  asincrono(async (req, res) => {
    res.json({ ok: true, datos: await servicio.obtener(req.params.id) });
  }),
);

// POST /api/v1/buses
router.post(
  '/',
  requiereNivel(MODULO, 'E'),
  validar({ body: esquema.crearBusSchema }),
  asincrono(async (req, res) => {
    verificarAmbitoMunicipal(req, req.body.municipalidadId);
    res.status(201).json({ ok: true, datos: await servicio.crear(req.body, req.usuario.id) });
  }),
);

// PATCH /api/v1/buses/:id
router.patch(
  '/:id',
  requiereNivel(MODULO, 'E'),
  validar({ params: esquema.idParam, body: esquema.actualizarBusSchema }),
  asincrono(async (req, res) => {
    const actual = await servicio.obtener(req.params.id);
    verificarAmbitoMunicipal(req, actual.municipalidad_id);
    res.json({ ok: true, datos: await servicio.actualizar(req.params.id, req.body, req.usuario.id) });
  }),
);

// ---------------------------------------------------------------------------
// RF-04: asignacion a una unica linea activa
// ---------------------------------------------------------------------------

// POST /api/v1/buses/:id/asignacion
router.post(
  '/:id/asignacion',
  requiereNivel(MODULO, 'E'),
  validar({ params: esquema.idParam, body: esquema.asignarLineaSchema }),
  asincrono(async (req, res) => {
    const bus = await servicio.obtener(req.params.id);
    verificarAmbitoMunicipal(req, bus.municipalidad_id);
    const datos = await servicio.asignarALinea(req.params.id, req.body, req.usuario.id);
    res.status(201).json({ ok: true, datos });
  }),
);

// DELETE /api/v1/buses/:id/asignacion
router.delete(
  '/:id/asignacion',
  requiereNivel(MODULO, 'E'),
  validar({ params: esquema.idParam, body: esquema.finalizarAsignacionSchema }),
  asincrono(async (req, res) => {
    const bus = await servicio.obtener(req.params.id);
    verificarAmbitoMunicipal(req, bus.municipalidad_id);
    res.json({ ok: true, datos: await servicio.finalizarAsignacion(req.params.id, req.body, req.usuario.id) });
  }),
);

// GET /api/v1/buses/:id/asignaciones  (historial)
router.get(
  '/:id/asignaciones',
  requiereNivel(MODULO, 'L'),
  validar({ params: esquema.idParam }),
  asincrono(async (req, res) => {
    res.json({ ok: true, datos: await servicio.historialAsignaciones(req.params.id) });
  }),
);

// ---------------------------------------------------------------------------
// RF-06: parqueo de la unidad
// ---------------------------------------------------------------------------

// POST /api/v1/buses/:id/parqueo
router.post(
  '/:id/parqueo',
  requiereNivel(MODULO, 'E'),
  validar({ params: esquema.idParam, body: parqueosEsquema.asignarParqueoSchema }),
  asincrono(async (req, res) => {
    const bus = await servicio.obtener(req.params.id);
    verificarAmbitoMunicipal(req, bus.municipalidad_id);
    const datos = await parqueos.asignarBus(req.params.id, req.body, req.usuario.id);
    res.status(201).json({ ok: true, datos });
  }),
);

// DELETE /api/v1/buses/:id/parqueo
router.delete(
  '/:id/parqueo',
  requiereNivel(MODULO, 'E'),
  validar({ params: esquema.idParam }),
  asincrono(async (req, res) => {
    res.json({ ok: true, datos: await parqueos.liberarBus(req.params.id, req.usuario.id) });
  }),
);

export default router;
