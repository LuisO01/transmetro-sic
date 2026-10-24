import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { pool, enTransaccion } from '../../db/pool.js';
import { validar } from '../../middlewares/validacion.js';
import { autenticar } from '../../middlewares/autenticacion.js';
import { requiereNivel, resolverAmbito, verificarAmbitoMunicipal } from '../../middlewares/autorizacion.js';
import { MODULOS } from '../../config/permisos.js';
import { asincrono, paginacion } from '../../utils/asincrono.js';
import { ApiError } from '../../utils/errores.js';

const router = Router();
const MODULO = MODULOS.SEGURIDAD;

router.use(autenticar, resolverAmbito);

const idParam = z.object({ id: z.coerce.number().int().positive() });

const crearUsuarioSchema = z.object({
  username: z.string().min(4).max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Use letras, numeros, punto, guion o guion bajo'),
  correo: z.string().email().max(120),
  nombreCompleto: z.string().min(5).max(150),
  password: z
    .string()
    .min(10, 'Minimo 10 caracteres')
    .max(72)
    .regex(/[A-Z]/, 'Debe incluir una mayuscula')
    .regex(/[a-z]/, 'Debe incluir una minuscula')
    .regex(/[0-9]/, 'Debe incluir un numero'),
  municipalidadId: z.number().int().positive().optional(),
  estacionId: z.number().int().positive().optional(),
  personaId: z.number().int().positive().optional(),
  roles: z.array(z.string().max(40)).min(1, 'Asigne al menos un rol'),
});

const rolesSchema = z.object({
  roles: z.array(z.string().max(40)).min(1),
});

/** GET /api/v1/usuarios */
router.get(
  '/',
  requiereNivel(MODULO, 'E'),
  asincrono(async (req, res) => {
    const { limite, desplazamiento, pagina } = paginacion(req.query);
    const municipalidadId = req.ambito.municipalidadId ?? null;

    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.correo, u.nombre_completo, u.estado, u.ultimo_acceso,
              u.municipalidad_id, m.nombre AS municipalidad,
              u.estacion_id, e.nombre AS estacion,
              COALESCE(array_agg(r.codigo) FILTER (WHERE r.codigo IS NOT NULL), '{}') AS roles,
              count(*) OVER () AS total_registros
         FROM usuario u
         LEFT JOIN municipalidad m ON m.id = u.municipalidad_id
         LEFT JOIN estacion e      ON e.id = u.estacion_id
         LEFT JOIN usuario_rol ur  ON ur.usuario_id = u.id
         LEFT JOIN rol r           ON r.id = ur.rol_id
        WHERE ($1::bigint IS NULL OR u.municipalidad_id = $1)
        GROUP BY u.id, m.nombre, e.nombre
        ORDER BY u.username
        LIMIT $2 OFFSET $3`,
      [municipalidadId, limite, desplazamiento],
    );

    const total = rows.length ? Number(rows[0].total_registros) : 0;
    res.json({
      ok: true,
      total,
      pagina,
      limite,
      items: rows.map(({ total_registros: _t, ...fila }) => fila),
    });
  }),
);

/** POST /api/v1/usuarios */
router.post(
  '/',
  requiereNivel(MODULO, 'E'),
  validar({ body: crearUsuarioSchema }),
  asincrono(async (req, res) => {
    verificarAmbitoMunicipal(req, req.body.municipalidadId);

    // Solo el administrador general puede crear otro administrador general
    if (req.body.roles.includes('ADMIN_GENERAL') && !req.ambito.esAdminGeneral) {
      throw ApiError.prohibido('Solo un administrador general puede crear otro administrador general.');
    }

    const datos = await enTransaccion(req.usuario.id, async (cliente) => {
      const hash = await bcrypt.hash(req.body.password, env.auth.bcryptRounds);

      const { rows } = await cliente.query(
        `INSERT INTO usuario (username, correo, password_hash, nombre_completo,
                              municipalidad_id, estacion_id, persona_id, debe_cambiar_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         RETURNING id, username, correo, nombre_completo, estado`,
        [
          req.body.username, req.body.correo, hash, req.body.nombreCompleto,
          req.body.municipalidadId ?? null, req.body.estacionId ?? null, req.body.personaId ?? null,
        ],
      );

      const usuario = rows[0];

      const { rowCount } = await cliente.query(
        `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por)
         SELECT $1, r.id, $3 FROM rol r WHERE r.codigo = ANY($2::text[])`,
        [usuario.id, req.body.roles, req.usuario.id],
      );

      if (rowCount !== req.body.roles.length) {
        throw ApiError.invalido('Alguno de los roles indicados no existe.', { roles: req.body.roles });
      }

      return usuario;
    });

    res.status(201).json({ ok: true, datos });
  }),
);

/** PUT /api/v1/usuarios/:id/roles — reemplaza los roles del usuario. */
router.put(
  '/:id/roles',
  requiereNivel(MODULO, 'E'),
  validar({ params: idParam, body: rolesSchema }),
  asincrono(async (req, res) => {
    if (req.body.roles.includes('ADMIN_GENERAL') && !req.ambito.esAdminGeneral) {
      throw ApiError.prohibido('Solo un administrador general puede otorgar ese rol.');
    }

    const datos = await enTransaccion(req.usuario.id, async (cliente) => {
      const { rows: objetivo } = await cliente.query(
        'SELECT id, municipalidad_id FROM usuario WHERE id = $1',
        [req.params.id],
      );
      if (objetivo.length === 0) throw ApiError.noEncontrado('Usuario');
      verificarAmbitoMunicipal(req, objetivo[0].municipalidad_id);

      await cliente.query('DELETE FROM usuario_rol WHERE usuario_id = $1', [req.params.id]);
      await cliente.query(
        `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por)
         SELECT $1, r.id, $3 FROM rol r WHERE r.codigo = ANY($2::text[])`,
        [req.params.id, req.body.roles, req.usuario.id],
      );

      const { rows } = await cliente.query(
        'SELECT modulo, nivel FROM v_permisos_usuario WHERE usuario_id = $1',
        [req.params.id],
      );
      return { usuarioId: Number(req.params.id), roles: req.body.roles, permisos: rows };
    });

    res.json({ ok: true, datos });
  }),
);

/** PATCH /api/v1/usuarios/:id/estado — activar, bloquear o inactivar. */
router.patch(
  '/:id/estado',
  requiereNivel(MODULO, 'E'),
  validar({
    params: idParam,
    body: z.object({ estado: z.enum(['activo', 'bloqueado', 'inactivo']) }),
  }),
  asincrono(async (req, res) => {
    const datos = await enTransaccion(req.usuario.id, async (cliente) => {
      const { rows } = await cliente.query(
        `UPDATE usuario
            SET estado = $2,
                intentos_fallidos = 0,
                bloqueado_hasta = NULL
          WHERE id = $1
          RETURNING id, username, estado`,
        [req.params.id, req.body.estado],
      );
      if (rows.length === 0) throw ApiError.noEncontrado('Usuario');

      if (req.body.estado !== 'activo') {
        await cliente.query(
          'UPDATE sesion_refresh SET revocado_en = now() WHERE usuario_id = $1 AND revocado_en IS NULL',
          [req.params.id],
        );
      }
      return rows[0];
    });
    res.json({ ok: true, datos });
  }),
);

/** GET /api/v1/usuarios/matriz-permisos — la matriz rol x modulo vigente. */
router.get(
  '/matriz-permisos',
  requiereNivel(MODULO, 'E'),
  asincrono(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT r.codigo AS rol, r.nombre AS rol_nombre, r.ambito,
              mo.codigo AS modulo, mo.nombre AS modulo_nombre, rp.nivel
         FROM rol r
         CROSS JOIN modulo mo
         LEFT JOIN rol_permiso rp ON rp.rol_id = r.id AND rp.modulo_id = mo.id
        ORDER BY mo.orden, r.codigo`,
    );
    res.json({ ok: true, datos: rows });
  }),
);

export default router;
