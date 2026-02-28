import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, 'Email o usuario es requerido').max(255, 'Email o usuario demasiado largo'),
  password: z.string().min(1, 'Password es requerido').max(128, 'Password demasiado largo'),
});
