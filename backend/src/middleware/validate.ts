// Middleware de validación con Zod
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Middleware factory que valida req[target] contra un schema Zod.
 * Reemplaza req[target] con los valores parseados (coerced/defaulted).
 */
export const validate = (schema: ZodSchema, target: ValidationTarget = 'body') =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[target]);
      // Reemplazar con valores parseados (aplica defaults, coercion, etc.)
      (req as any)[target] = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Datos inválidos',
          message: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
          details: error.errors,
        });
        return;
      }
      next(error);
    }
  };
