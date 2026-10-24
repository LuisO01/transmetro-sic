import { z } from 'zod';

export const loginSchema = z.object({
  usuario: z.string().min(4, 'Indique su usuario o correo').max(120),
  password: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres').max(72),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token invalido'),
});

export const cambiarPasswordSchema = z.object({
  passwordActual: z.string().min(8).max(72),
  passwordNueva: z
    .string()
    .min(10, 'La nueva contrasena debe tener al menos 10 caracteres')
    .max(72)
    .regex(/[A-Z]/, 'Debe incluir al menos una mayuscula')
    .regex(/[a-z]/, 'Debe incluir al menos una minuscula')
    .regex(/[0-9]/, 'Debe incluir al menos un numero'),
});
