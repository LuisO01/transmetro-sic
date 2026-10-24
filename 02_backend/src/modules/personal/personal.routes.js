import { Router } from 'express';
import { z } from 'zod';
import * as servicio from './personal.service.js';
import { validar } from '../../middlewares/validacion.js';
import { autenticar } from '../../middlewares/autenticacion.js';
import { requiereNivel, resolverAmbito } from '../../middlewares/autorizacion.js';
import { MODULOS, ROLES } from '../../config/permisos.js';
import { asincrono } from '../../utils/asincrono.js';
import { ApiError } from '../../utils/errores.js';

const router = Router();
const MODULO = MODULOS.PERSONAL;

router.use(autenticar, resolverAmbito);

const idParam = z.object({ id: z.coerce.number().int().positive() });

const estudioSchema = z.object({
  nivel: z.enum(['primaria', 'basicos', 'diversificado', 'tecnico', 'universidad', 'postgrado']),
  institucion: z.string().min(3).max(150),
  tituloObtenido: z.string().max(150).optional(),
  anioInicio: z.number().int().min(1950).max(2100).optional(),
  anioFin: z.number().int().min(1950).max(2100).optional(),
});

const actualizarPilotoSchema = z.object({
  numeroLicencia: z.string().max(25).optional(),
  tipoLicencia: z.enum(['A', 'B', 'C', 'M', 'E']).optional(),
  vigenciaLicencia: z.string().date().optional(),
  estado: z.enum(['activo', 'suspendido', 'vacaciones', 'baja']).optional(),
  observaciones: z.string().max(250).optional(),
});

const coberturaSchema = z.object({
  guardiaId: z.number().int().positive(),
  accesoId: z.number().int().positive(),
  turnoId: z.number().int().positive(),
  fecha: z.string().date(),
  estado: z.enum(['programado', 'presente', 'ausente', 'cubierto']).optional(),
  observacion: z.string().max(250).optional(),
});

const estadoCoberturaSchema = z.object({
  estado: z.enum(['programado', 'presente', 'ausente', 'cubierto']),
  observacion: z.string().max(250).optional(),
});

const esPropio = (req) => req.ambito.tipo === 'propio';

// GET /api/v1/personal/resumen
router.get(
  '/resumen',
  requiereNivel(MODULO, 'L'),
  asincrono(async (req, res) => {
    res.json({ ok: true, datos: await servicio.resumen({ municipalidadId: req.ambito.municipalidadId }) });
  }),
);

// ---------------------------------------------------------------------------
// Pilotos (RF-07)
// ---------------------------------------------------------------------------

// GET /api/v1/personal/pilotos
router.get(
  '/pilotos',
  requiereNivel(MODULO, 'L'),
  asincrono(async (req, res) => {
    // El piloto no lista a sus companeros: solo accede a su propio expediente
    if (esPropio(req)) throw ApiError.prohibido('Consulte su expediente en Mi expediente.');
    const datos = await servicio.listarPilotos({
      municipalidadId: req.ambito.municipalidadId ?? undefined,
      texto: req.query.texto,
      estado: req.query.estado,
    });
    res.json({ ok: true, datos, total: datos.length });
  }),
);

// GET /api/v1/personal/mi-expediente   (el piloto consulta el suyo)
router.get(
  '/mi-expediente',
  requiereNivel(MODULO, 'L'),
  asincrono(async (req, res) => {
    if (!req.usuario.personaId) {
      throw ApiError.invalido('Su cuenta no esta vinculada a un expediente.');
    }
    res.json({ ok: true, datos: await servicio.expedientePiloto(req.usuario.personaId) });
  }),
);

// GET /api/v1/personal/pilotos/:id
router.get(
  '/pilotos/:id',
  requiereNivel(MODULO, 'L'),
  validar({ params: idParam }),
  asincrono(async (req, res) => {
    if (esPropio(req) && Number(req.params.id) !== Number(req.usuario.personaId)) {
      throw ApiError.prohibido('Solo puede consultar su propio expediente.');
    }
    res.json({ ok: true, datos: await servicio.expedientePiloto(req.params.id) });
  }),
);

// PATCH /api/v1/personal/pilotos/:id
router.patch(
  '/pilotos/:id',
  requiereNivel(MODULO, 'E'),
  validar({ params: idParam, body: actualizarPilotoSchema }),
  asincrono(async (req, res) => {
    if (esPropio(req)) throw ApiError.prohibido('No puede modificar su propio expediente laboral.');
    res.json({ ok: true, datos: await servicio.actualizarPiloto(req.params.id, req.body, req.usuario.id) });
  }),
);

// POST /api/v1/personal/pilotos/:id/educacion
router.post(
  '/pilotos/:id/educacion',
  requiereNivel(MODULO, 'E'),
  validar({ params: idParam, body: estudioSchema }),
  asincrono(async (req, res) => {
    if (esPropio(req)) throw ApiError.prohibido('No puede modificar su propio expediente laboral.');
    const datos = await servicio.agregarEstudio(req.params.id, req.body, req.usuario.id);
    res.status(201).json({ ok: true, datos });
  }),
);

// ---------------------------------------------------------------------------
// Guardias y cobertura (RF-08)
// ---------------------------------------------------------------------------

// GET /api/v1/personal/guardias
router.get(
  '/guardias',
  requiereNivel(MODULO, 'L'),
  asincrono(async (req, res) => {
    if (esPropio(req) && !req.usuario.roles.includes(ROLES.GUARDIA)) {
      throw ApiError.prohibido('Sin acceso al listado de guardias.');
    }
    const datos = await servicio.listarGuardias({
      municipalidadId: req.ambito.municipalidadId ?? undefined,
      texto: req.query.texto,
    });
    res.json({ ok: true, datos, total: datos.length });
  }),
);

// GET /api/v1/personal/turnos
router.get(
  '/turnos',
  requiereNivel(MODULO, 'L'),
  asincrono(async (_req, res) => {
    res.json({ ok: true, datos: await servicio.turnos() });
  }),
);

// GET /api/v1/personal/cobertura   (RF-08)
router.get(
  '/cobertura',
  requiereNivel(MODULO, 'L'),
  asincrono(async (req, res) => {
    if (esPropio(req)) throw ApiError.prohibido('Consulte sus turnos en Mi cobertura.');
    const datos = await servicio.cobertura({
      estacionId: req.query.estacionId,
      accesoId: req.query.accesoId,
      soloIncumplidos: req.query.soloIncumplidos === 'true',
    });
    res.json({ ok: true, datos, total: datos.length });
  }),
);

// GET /api/v1/personal/mi-cobertura   (el guardia consulta sus turnos)
router.get(
  '/mi-cobertura',
  requiereNivel(MODULO, 'L'),
  asincrono(async (req, res) => {
    if (!req.usuario.personaId) {
      throw ApiError.invalido('Su cuenta no esta vinculada a un expediente de guardia.');
    }
    res.json({ ok: true, datos: await servicio.miCobertura(req.usuario.personaId) });
  }),
);

// POST /api/v1/personal/cobertura
router.post(
  '/cobertura',
  requiereNivel(MODULO, 'E'),
  validar({ body: coberturaSchema }),
  asincrono(async (req, res) => {
    if (esPropio(req)) throw ApiError.prohibido('La programacion de turnos la realiza el administrador.');
    const datos = await servicio.programarCobertura(req.body, req.usuario.id);
    res.status(201).json({ ok: true, datos });
  }),
);

// PATCH /api/v1/personal/cobertura/:id
router.patch(
  '/cobertura/:id',
  requiereNivel(MODULO, 'E'),
  validar({ params: idParam, body: estadoCoberturaSchema }),
  asincrono(async (req, res) => {
    // El guardia solo puede marcar sus propios turnos
    const limite = esPropio(req) ? req.usuario.personaId : null;
    const datos = await servicio.actualizarCobertura(req.params.id, req.body, req.usuario.id, limite);
    res.json({ ok: true, datos });
  }),
);

// DELETE /api/v1/personal/cobertura/:id
router.delete(
  '/cobertura/:id',
  requiereNivel(MODULO, 'E'),
  validar({ params: idParam }),
  asincrono(async (req, res) => {
    if (esPropio(req)) throw ApiError.prohibido('No puede eliminar turnos programados.');
    res.json({ ok: true, datos: await servicio.eliminarCobertura(req.params.id, req.usuario.id) });
  }),
);

export default router;
