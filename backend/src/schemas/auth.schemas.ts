import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, 'Email es requerido').email('Formato de email inválido'),
  password: z.string().min(1, 'Password es requerido').max(128, 'Password demasiado largo'),
});
