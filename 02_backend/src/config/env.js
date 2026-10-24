import dotenv from 'dotenv';

dotenv.config();

function requerido(nombre, porDefecto) {
  const valor = process.env[nombre] ?? porDefecto;
  if (valor === undefined || valor === '') {
    throw new Error(`Falta la variable de entorno obligatoria: ${nombre}`);
  }
  return valor;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  puerto: Number(process.env.PORT ?? 4000),

  db: {
    url: requerido('DATABASE_URL'),
    ssl: process.env.DB_SSL === 'true',
    poolMax: Number(process.env.DB_POOL_MAX ?? 10),
    schema: process.env.DB_SCHEMA ?? 'transmetro',
  },

  auth: {
    jwtSecret: requerido('JWT_SECRET'),
    jwtRefreshSecret: requerido('JWT_REFRESH_SECRET'),
    expiraEn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiraEn: process.env.JWT_REFRESH_EXPIRES_IN ?? '8h',
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
    maxIntentosFallidos: Number(process.env.MAX_INTENTOS_FALLIDOS ?? 5),
    minutosBloqueo: Number(process.env.MINUTOS_BLOQUEO ?? 15),
  },

  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),

  get esProduccion() {
    return this.nodeEnv === 'production';
  },
};
