import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as servicio from './auth.service.js';
import { loginSchema, refreshSchema, cambiarPasswordSchema } from './auth.schema.js';
import { validar } from '../../middlewares/validacion.js';
import { autenticar } from '../../middlewares/autenticacion.js';
import { asincrono } from '../../utils/asincrono.js';

const router = Router();

/** Freno a la fuerza bruta, complementario al bloqueo por intentos fallidos. */
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    ok: false,
    error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos. Espere unos minutos.' },
  },
});

const contexto = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

// POST /api/v1/auth/login
router.post(
  '/login',
  limiteLogin,
  validar({ body: loginSchema }),
  asincrono(async (req, res) => {
    const datos = await servicio.iniciarSesion({ ...req.body, ...contexto(req) });
    res.json({ ok: true, datos });
  }),
);

// POST /api/v1/auth/refresh
router.post(
  '/refresh',
  validar({ body: refreshSchema }),
  asincrono(async (req, res) => {
    const datos = await servicio.refrescar({ ...req.body, ...contexto(req) });
    res.json({ ok: true, datos });
  }),
);

// POST /api/v1/auth/logout
router.post(
  '/logout',
  autenticar,
  asincrono(async (req, res) => {
    await servicio.cerrarSesion({
      refreshToken: req.body?.refreshToken,
      usuarioId: req.usuario.id,
      username: req.usuario.username,
      ...contexto(req),
    });
    res.json({ ok: true, datos: { mensaje: 'Sesion cerrada.' } });
  }),
);

// GET /api/v1/auth/perfil
router.get(
  '/perfil',
  autenticar,
  asincrono(async (req, res) => {
    const datos = await servicio.obtenerPerfil(req.usuario.id);
    res.json({ ok: true, datos });
  }),
);

// PATCH /api/v1/auth/password
router.patch(
  '/password',
  autenticar,
  validar({ body: cambiarPasswordSchema }),
  asincrono(async (req, res) => {
    await servicio.cambiarPassword({
      usuarioId: req.usuario.id,
      ...req.body,
      ...contexto(req),
    });
    res.json({ ok: true, datos: { mensaje: 'Contrasena actualizada. Vuelva a iniciar sesion.' } });
  }),
);

export default router;
