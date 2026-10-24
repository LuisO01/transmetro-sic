import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { crearApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { MODULOS } from '../src/config/permisos.js';

/**
 * Pruebas de la capa de autenticacion y autorizacion. No requieren base de
 * datos: verifican que el arbol de rutas se monte y que la matriz de permisos
 * (RF-15) se aplique antes de llegar a la capa de servicios.
 */

const app = crearApp();

function tokenPara(permisos, extras = {}) {
  return jwt.sign(
    {
      sub: 1,
      username: 'prueba',
      nombre: 'Usuario de prueba',
      roles: ['OPERADOR_ESTACION'],
      permisos,
      ambito: 'estacion',
      municipalidadId: 1,
      estacionId: 3,
      ...extras,
    },
    env.auth.jwtSecret,
    { expiresIn: '5m' },
  );
}

describe('autenticacion', () => {
  it('rechaza una ruta protegida sin token', async () => {
    const res = await request(app).get('/api/v1/lineas');
    expect(res.status).toBe(401);
    expect(res.body.error.codigo).toBe('NO_AUTENTICADO');
  });

  it('rechaza un token con firma invalida', async () => {
    const falso = jwt.sign({ sub: 1 }, 'otro-secreto');
    const res = await request(app).get('/api/v1/lineas').set('Authorization', `Bearer ${falso}`);
    expect(res.status).toBe(401);
  });

  it('valida el cuerpo del login antes de consultar la base', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ usuario: 'ab', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
  });

  it('devuelve 404 con formato uniforme en una ruta inexistente', async () => {
    const res = await request(app).get('/api/v1/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});

describe('matriz de permisos (RF-15)', () => {
  it('permite leer lineas con nivel L', async () => {
    const token = tokenPara({ [MODULOS.LINEAS_ESTACIONES]: 'L' });
    const res = await request(app).get('/api/v1/lineas').set('Authorization', `Bearer ${token}`);
    // Pasa la autorizacion; sin base de datos el fallo posterior es 500, nunca 403
    expect(res.status).not.toBe(403);
  });

  it('niega crear una linea con nivel L (solo lectura)', async () => {
    const token = tokenPara({ [MODULOS.LINEAS_ESTACIONES]: 'L' });
    const res = await request(app)
      .post('/api/v1/lineas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        codigo: 'L9',
        nombre: 'Linea de prueba',
        municipalidadId: 1,
        unidadesMinimas: 5,
        unidadesMaximas: 10,
      });
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('PROHIBIDO');
  });

  it('niega el modulo de flota a quien no lo tiene en su matriz', async () => {
    const token = tokenPara({ [MODULOS.LINEAS_ESTACIONES]: 'L' });
    const res = await request(app).get('/api/v1/buses').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('exige nivel A para dar de baja una linea', async () => {
    const token = tokenPara({ [MODULOS.LINEAS_ESTACIONES]: 'E' });
    const res = await request(app).delete('/api/v1/lineas/1').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('validacion de reglas antes de la base (RF-05)', () => {
  it('rechaza una linea cuyo maximo es menor que el minimo', async () => {
    const token = tokenPara({ [MODULOS.LINEAS_ESTACIONES]: 'A' });
    const res = await request(app)
      .post('/api/v1/lineas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        codigo: 'L9',
        nombre: 'Linea invalida',
        municipalidadId: 1,
        unidadesMinimas: 20,
        unidadesMaximas: 5,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.detalle.some((d) => d.campo === 'unidadesMaximas')).toBe(true);
  });
});
