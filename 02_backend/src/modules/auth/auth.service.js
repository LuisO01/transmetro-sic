import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { pool, enTransaccion } from '../../db/pool.js';
import { ApiError } from '../../utils/errores.js';
import { ambitoMasAmplio } from '../../config/permisos.js';

const sha256 = (valor) => crypto.createHash('sha256').update(valor).digest('hex');

/** Registra un evento de sesion en la bitacora de auditoria (RF-16). */
async function registrarEvento(cliente, { usuarioId, username, accion, ip, userAgent }) {
  await cliente.query(
    `INSERT INTO bitacora_auditoria
        (usuario_id, username_snapshot, accion, modulo, direccion_ip, user_agent)
     VALUES ($1, $2, $3, 'SEGURIDAD', $4, $5)`,
    [usuarioId, username, accion, ip ?? null, userAgent ?? null],
  );
}

/** Carga roles, permisos efectivos y ambito del usuario. */
async function cargarContexto(cliente, usuarioId) {
  const { rows: roles } = await cliente.query(
    `SELECT r.codigo, r.ambito
       FROM usuario_rol ur
       JOIN rol r ON r.id = ur.rol_id AND r.activo
      WHERE ur.usuario_id = $1`,
    [usuarioId],
  );

  const { rows: permisos } = await cliente.query(
    'SELECT modulo, nivel FROM v_permisos_usuario WHERE usuario_id = $1',
    [usuarioId],
  );

  return {
    roles: roles.map((r) => r.codigo),
    ambito: ambitoMasAmplio(roles.map((r) => r.ambito)),
    permisos: Object.fromEntries(permisos.map((p) => [p.modulo, p.nivel])),
  };
}

function firmarTokens(usuario, contexto) {
  const carga = {
    sub: usuario.id,
    username: usuario.username,
    nombre: usuario.nombre_completo,
    roles: contexto.roles,
    permisos: contexto.permisos,
    ambito: contexto.ambito,
    municipalidadId: usuario.municipalidad_id,
    estacionId: usuario.estacion_id,
    personaId: usuario.persona_id,
  };

  const accessToken = jwt.sign(carga, env.auth.jwtSecret, { expiresIn: env.auth.expiraEn });
  const refreshToken = jwt.sign({ sub: usuario.id }, env.auth.jwtRefreshSecret, {
    expiresIn: env.auth.refreshExpiraEn,
  });

  return { accessToken, refreshToken, carga };
}

export async function iniciarSesion({ usuario: identificador, password, ip, userAgent }) {
  return enTransaccion(null, async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT id, username, correo, password_hash, nombre_completo, estado,
              intentos_fallidos, bloqueado_hasta, debe_cambiar_password,
              municipalidad_id, estacion_id, persona_id
         FROM usuario
        WHERE username = $1 OR correo = $1`,
      [identificador],
    );

    const u = rows[0];

    // Mensaje uniforme: no revela si el usuario existe
    if (!u) {
      await registrarEvento(cliente, {
        usuarioId: null, username: identificador, accion: 'LOGIN_FALLIDO', ip, userAgent,
      });
      throw ApiError.noAutorizado();
    }

    if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date()) {
      throw ApiError.noAutorizado(
        `La cuenta esta bloqueada temporalmente hasta ${new Date(u.bloqueado_hasta).toLocaleString('es-GT')}.`,
      );
    }

    if (u.estado !== 'activo') {
      throw ApiError.noAutorizado('La cuenta no se encuentra activa. Contacte al administrador.');
    }

    const coincide = await bcrypt.compare(password, u.password_hash);

    if (!coincide) {
      const intentos = u.intentos_fallidos + 1;
      const bloquear = intentos >= env.auth.maxIntentosFallidos;

      await cliente.query(
        `UPDATE usuario
            SET intentos_fallidos = $2,
                bloqueado_hasta   = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE bloqueado_hasta END
          WHERE id = $1`,
        [u.id, bloquear ? 0 : intentos, bloquear, String(env.auth.minutosBloqueo)],
      );

      await registrarEvento(cliente, {
        usuarioId: u.id, username: u.username, accion: 'LOGIN_FALLIDO', ip, userAgent,
      });

      throw ApiError.noAutorizado(
        bloquear
          ? `Demasiados intentos fallidos. La cuenta quedo bloqueada ${env.auth.minutosBloqueo} minutos.`
          : 'Credenciales invalidas.',
      );
    }

    await cliente.query(
      'UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = now() WHERE id = $1',
      [u.id],
    );

    const contexto = await cargarContexto(cliente, u.id);
    const { accessToken, refreshToken, carga } = firmarTokens(u, contexto);

    const { exp } = jwt.decode(refreshToken);
    await cliente.query(
      `INSERT INTO sesion_refresh (usuario_id, token_hash, expira_en, direccion_ip, user_agent)
       VALUES ($1, $2, to_timestamp($3), $4, $5)`,
      [u.id, sha256(refreshToken), exp, ip ?? null, userAgent ?? null],
    );

    await registrarEvento(cliente, {
      usuarioId: u.id, username: u.username, accion: 'LOGIN', ip, userAgent,
    });

    return {
      accessToken,
      refreshToken,
      usuario: {
        id: u.id,
        username: u.username,
        correo: u.correo,
        nombreCompleto: u.nombre_completo,
        debeCambiarPassword: u.debe_cambiar_password,
        municipalidadId: u.municipalidad_id,
        estacionId: u.estacion_id,
        roles: carga.roles,
        permisos: carga.permisos,
        ambito: carga.ambito,
      },
    };
  });
}

/** Rota el refresh token: el anterior queda revocado al usarse. */
export async function refrescar({ refreshToken, ip, userAgent }) {
  let carga;
  try {
    carga = jwt.verify(refreshToken, env.auth.jwtRefreshSecret);
  } catch {
    throw ApiError.noAutorizado('Refresh token invalido o expirado.');
  }

  return enTransaccion(null, async (cliente) => {
    const hash = sha256(refreshToken);
    const { rows: sesiones } = await cliente.query(
      `SELECT id FROM sesion_refresh
        WHERE token_hash = $1 AND revocado_en IS NULL AND expira_en > now()
        FOR UPDATE`,
      [hash],
    );

    if (sesiones.length === 0) {
      throw ApiError.noAutorizado('La sesion ya no es valida. Vuelva a iniciar sesion.');
    }

    await cliente.query('UPDATE sesion_refresh SET revocado_en = now() WHERE id = $1', [sesiones[0].id]);

    const { rows } = await cliente.query(
      `SELECT id, username, nombre_completo, estado, municipalidad_id, estacion_id, persona_id
         FROM usuario WHERE id = $1`,
      [carga.sub],
    );
    const u = rows[0];
    if (!u || u.estado !== 'activo') throw ApiError.noAutorizado('La cuenta no esta activa.');

    const contexto = await cargarContexto(cliente, u.id);
    const tokens = firmarTokens(u, contexto);
    const { exp } = jwt.decode(tokens.refreshToken);

    await cliente.query(
      `INSERT INTO sesion_refresh (usuario_id, token_hash, expira_en, direccion_ip, user_agent)
       VALUES ($1, $2, to_timestamp($3), $4, $5)`,
      [u.id, sha256(tokens.refreshToken), exp, ip ?? null, userAgent ?? null],
    );

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  });
}

export async function cerrarSesion({ refreshToken, usuarioId, username, ip, userAgent }) {
  await enTransaccion(null, async (cliente) => {
    if (refreshToken) {
      await cliente.query(
        'UPDATE sesion_refresh SET revocado_en = now() WHERE token_hash = $1 AND revocado_en IS NULL',
        [sha256(refreshToken)],
      );
    }
    await registrarEvento(cliente, { usuarioId, username, accion: 'LOGOUT', ip, userAgent });
  });
}

export async function obtenerPerfil(usuarioId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.correo, u.nombre_completo, u.estado,
            u.debe_cambiar_password, u.ultimo_acceso,
            u.municipalidad_id, m.nombre AS municipalidad,
            u.estacion_id, e.nombre AS estacion
       FROM usuario u
       LEFT JOIN municipalidad m ON m.id = u.municipalidad_id
       LEFT JOIN estacion e      ON e.id = u.estacion_id
      WHERE u.id = $1`,
    [usuarioId],
  );

  if (rows.length === 0) throw ApiError.noEncontrado('Usuario');

  const contexto = await cargarContexto(pool, usuarioId);
  return { ...rows[0], ...contexto };
}

export async function cambiarPassword({ usuarioId, passwordActual, passwordNueva, ip, userAgent }) {
  return enTransaccion(usuarioId, async (cliente) => {
    const { rows } = await cliente.query(
      'SELECT id, username, password_hash FROM usuario WHERE id = $1',
      [usuarioId],
    );
    const u = rows[0];
    if (!u) throw ApiError.noEncontrado('Usuario');

    if (!(await bcrypt.compare(passwordActual, u.password_hash))) {
      throw ApiError.noAutorizado('La contrasena actual no es correcta.');
    }

    const hash = await bcrypt.hash(passwordNueva, env.auth.bcryptRounds);
    await cliente.query(
      'UPDATE usuario SET password_hash = $2, debe_cambiar_password = false WHERE id = $1',
      [u.id, hash],
    );

    // Cambiar la contrasena invalida todas las sesiones abiertas
    await cliente.query(
      'UPDATE sesion_refresh SET revocado_en = now() WHERE usuario_id = $1 AND revocado_en IS NULL',
      [u.id],
    );

    await registrarEvento(cliente, {
      usuarioId: u.id, username: u.username, accion: 'UPDATE', ip, userAgent,
    });

    return { ok: true };
  });
}
