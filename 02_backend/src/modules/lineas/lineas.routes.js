import { Router } from 'express';
import * as servicio from './lineas.service.js';
import * as esquema from './lineas.schema.js';
import { validar } from '../../middlewares/validacion.js';
import { autenticar } from '../../middlewares/autenticacion.js';
import { requiereNivel, resolverAmbito, verificarAmbitoMunicipal } from '../../middlewares/autorizacion.js';
import { MODULOS } from '../../config/permisos.js';
import { asincrono, paginacion } from '../../utils/asincrono.js';

const router = Router();
const MODULO = MODULOS.LINEAS_ESTACIONES;

router.use(autenticar, resolverAmbito);

// ---------------------------------------------------------------------------
// RF-01: catalogo de lineas
// ---------------------------------------------------------------------------

// GET /api/v1/lineas
router.get(
  '/',
  requiereNivel(MODULO, 'L'),
  validar({ query: esquema.listarQuery }),
  asincrono(async (req, res) => {
    const { limite, desplazamiento, pagina } = paginacion(req.query);
    const datos = await servicio.listar({
      // El ambito municipal solo ve sus propias lineas
      municipalidadId: req.query.municipalidadId ?? req.ambito.municipalidadId ?? undefined,
      estado: req.query.estado,
      texto: req.query.texto,
      limite,
      desplazamiento,
    });
    res.json({ ok: true, ...datos, pagina, limite });
  }),
);

// GET /api/v1/lineas/:id
router.get(
  '/:id',
  requiereNivel(MODULO, 'L'),
  validar({ params: esquema.idParam }),
  asincrono(async (req, res) => {
    res.json({ ok: true, datos: await servicio.obtener(req.params.id) });
  }),
);

// POST /api/v1/lineas
router.post(
  '/',
  requiereNivel(MODULO, 'E'),
  validar({ body: esquema.crearLineaSchema }),
  asincrono(async (req, res) => {
    verificarAmbitoMunicipal(req, req.body.municipalidadId);
    const datos = await servicio.crear(req.body, req.usuario.id);
    res.status(201).json({ ok: true, datos });
  }),
);

// PATCH /api/v1/lineas/:id
router.patch(
  '/:id',
  requiereNivel(MODULO, 'E'),
  validar({ params: esquema.idParam, body: esquema.actualizarLineaSchema }),
  asincrono(async (req, res) => {
    const actual = await servicio.obtener(req.params.id);
    verificarAmbitoMunicipal(req, actual.municipalidad_id);
    if (req.body.municipalidadId) verificarAmbitoMunicipal(req, req.body.municipalidadId);

    const datos = await servicio.actualizar(req.params.id, req.body, req.usuario.id);
    res.json({ ok: true, datos });
  }),
);

// DELETE /api/v1/lineas/:id  (baja logica)
router.delete(
  '/:id',
  requiereNivel(MODULO, 'A'),
  validar({ params: esquema.idParam }),
  asincrono(async (req, res) => {
    const datos = await servicio.darDeBaja(req.params.id, req.usuario.id);
    res.json({ ok: true, datos });
  }),
);

// ---------------------------------------------------------------------------
// RF-01 / RF-02: recorrido, orden de estaciones y distancias
// ---------------------------------------------------------------------------

// GET /api/v1/lineas/:id/recorrido?sentido=ida
router.get(
  '/:id/recorrido',
  requiereNivel(MODULO, 'L'),
  validar({ params: esquema.idParam, query: esquema.sentidoQuery }),
  asincrono(async (req, res) => {
    const datos = await servicio.obtenerRecorrido(req.params.id, req.query.sentido);
    res.json({ ok: true, datos });
  }),
);

// POST /api/v1/lineas/:id/recorrido
router.post(
  '/:id/recorrido',
  requiereNivel(MODULO, 'E'),
  validar({ params: esquema.idParam, body: esquema.agregarTramoSchema }),
  asincrono(async (req, res) => {
    const linea = await servicio.obtener(req.params.id);
    verificarAmbitoMunicipal(req, linea.municipalidad_id);

    const datos = await servicio.agregarEstacionAlRecorrido(req.params.id, req.body, req.usuario.id);
    res.status(201).json({ ok: true, datos });
  }),
);

// PATCH /api/v1/lineas/:id/recorrido/:tramoId
router.patch(
  '/:id/recorrido/:tramoId',
  requiereNivel(MODULO, 'E'),
  validar({ params: esquema.tramoParam, body: esquema.actualizarTramoSchema }),
  asincrono(async (req, res) => {
    const datos = await servicio.actualizarTramo(req.params.tramoId, req.body, req.usuario.id);
    res.json({ ok: true, datos });
  }),
);

// DELETE /api/v1/lineas/:id/recorrido/:tramoId
router.delete(
  '/:id/recorrido/:tramoId',
  requiereNivel(MODULO, 'E'),
  validar({ params: esquema.tramoParam }),
  asincrono(async (req, res) => {
    const datos = await servicio.quitarEstacionDelRecorrido(req.params.tramoId, req.usuario.id);
    res.json({ ok: true, datos });
  }),
);

// ---------------------------------------------------------------------------
// RF-04 / RF-05: unidades de la linea y situacion frente al rango permitido
// ---------------------------------------------------------------------------

// GET /api/v1/lineas/:id/unidades
router.get(
  '/:id/unidades',
  requiereNivel(MODULOS.FLOTA, 'L'),
  validar({ params: esquema.idParam }),
  asincrono(async (req, res) => {
    res.json({ ok: true, datos: await servicio.obtenerUnidades(req.params.id) });
  }),
);

export default router;
