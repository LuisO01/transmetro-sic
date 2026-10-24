import { Router } from 'express';
import * as servicio from './accesos.service.js';
import * as esquema from './accesos.schema.js';
import { validar } from '../../middlewares/validacion.js';
import { autenticar } from '../../middlewares/autenticacion.js';
import { requiereNivel, resolverAmbito, verificarAmbitoMunicipal } from '../../middlewares/autorizacion.js';
import { MODULOS } from '../../config/permisos.js';
import { asincrono } from '../../utils/asincrono.js';

const router = Router();
const MODULO = MODULOS.LINEAS_ESTACIONES;

router.use(autenticar, resolverAmbito);

// GET /api/v1/accesos/:id
router.get(
  '/:id',
  requiereNivel(MODULO, 'L'),
  validar({ params: esquema.idParam }),
  asincrono(async (req, res) => {
    res.json({ ok: true, datos: await servicio.obtener(req.params.id) });
  }),
);

// PATCH /api/v1/accesos/:id
router.patch(
  '/:id',
  requiereNivel(MODULO, 'E'),
  validar({ params: esquema.idParam, body: esquema.actualizarAccesoSchema }),
  asincrono(async (req, res) => {
    const actual = await servicio.obtener(req.params.id);
    verificarAmbitoMunicipal(req, actual.municipalidad_id);
    res.json({ ok: true, datos: await servicio.actualizar(req.params.id, req.body, req.usuario.id) });
  }),
);

// DELETE /api/v1/accesos/:id  (cierre logico)
router.delete(
  '/:id',
  requiereNivel(MODULO, 'A'),
  validar({ params: esquema.idParam }),
  asincrono(async (req, res) => {
    res.json({ ok: true, datos: await servicio.eliminar(req.params.id, req.usuario.id) });
  }),
);

// GET /api/v1/accesos/:id/cobertura   (RF-08)
router.get(
  '/:id/cobertura',
  requiereNivel(MODULOS.PERSONAL, 'L'),
  validar({ params: esquema.idParam }),
  asincrono(async (req, res) => {
    res.json({ ok: true, datos: await servicio.cobertura(req.params.id) });
  }),
);

export default router;
