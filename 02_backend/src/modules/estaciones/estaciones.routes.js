import { Router } from 'express';
import * as servicio from './estaciones.service.js';
import * as esquema from './estaciones.schema.js';
import * as accesos from '../accesos/accesos.service.js';
import * as accesosEsquema from '../accesos/accesos.schema.js';
import { validar } from '../../middlewares/validacion.js';
import { autenticar } from '../../middlewares/autenticacion.js';
import { requiereNivel, resolverAmbito, verificarAmbitoMunicipal } from '../../middlewares/autorizacion.js';
import { MODULOS } from '../../config/permisos.js';
import { asincrono, paginacion } from '../../utils/asincrono.js';

const router = Router();
const MODULO = MODULOS.LINEAS_ESTACIONES;

router.use(autenticar, resolverAmbito);

// GET /api/v1/estaciones
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
      tipo: req.query.tipo,
      texto: req.query.texto,
      limite,
      desplazamiento,
    });
    res.json({ ok: true, ...datos, pagina, limite });
  }),
);

// GET /api/v1/estaciones/:id
router.get(
  '/:id',
  requiereNivel(MODULO, 'L'),
  validar({ params: esquema.idParam }),
  asincrono(async (req, res) => {
    res.json({ ok: true, datos: await servicio.obtener(req.params.id) });
  }),
);

// POST /api/v1/estaciones
router.post(
  '/',
  requiereNivel(MODULO, 'E'),
  validar({ body: esquema.crearEstacionSchema }),
  asincrono(async (req, res) => {
    verificarAmbitoMunicipal(req, req.body.municipalidadId);
    const datos = await servicio.crear(req.body, req.usuario.id);
    res.status(201).json({ ok: true, datos });
  }),
);

// PATCH /api/v1/estaciones/:id
router.patch(
  '/:id',
  requiereNivel(MODULO, 'E'),
  validar({ params: esquema.idParam, body: esquema.actualizarEstacionSchema }),
  asincrono(async (req, res) => {
    const actual = await servicio.obtener(req.params.id);
    verificarAmbitoMunicipal(req, actual.municipalidad_id);
    const datos = await servicio.actualizar(req.params.id, req.body, req.usuario.id);
    res.json({ ok: true, datos });
  }),
);

// DELETE /api/v1/estaciones/:id  (cierre logico)
router.delete(
  '/:id',
  requiereNivel(MODULO, 'A'),
  validar({ params: esquema.idParam }),
  asincrono(async (req, res) => {
    res.json({ ok: true, datos: await servicio.cerrar(req.params.id, req.usuario.id) });
  }),
);

// ---------------------------------------------------------------------------
// RF-03: inventario de accesos de la estacion
// ---------------------------------------------------------------------------

// GET /api/v1/estaciones/:id/accesos
router.get(
  '/:id/accesos',
  requiereNivel(MODULO, 'L'),
  validar({ params: esquema.idParam }),
  asincrono(async (req, res) => {
    res.json({ ok: true, datos: await accesos.listarPorEstacion(req.params.id) });
  }),
);

// POST /api/v1/estaciones/:id/accesos
router.post(
  '/:id/accesos',
  requiereNivel(MODULO, 'E'),
  validar({ params: esquema.idParam, body: accesosEsquema.crearAccesoSchema }),
  asincrono(async (req, res) => {
    const estacion = await servicio.obtener(req.params.id);
    verificarAmbitoMunicipal(req, estacion.municipalidad_id);
    const datos = await accesos.crear(req.params.id, req.body, req.usuario.id);
    res.status(201).json({ ok: true, datos });
  }),
);

export default router;
