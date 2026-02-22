// Middleware de autenticación JWT (lee de httpOnly cookie)
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ACCESS_TOKEN_COOKIE } from '../lib/cookies';

// Extender el tipo Request para incluir userId
declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

interface JWTPayload {
  userId: number;
  email: string;
}

/**
 * Middleware que verifica que el usuario esté autenticado.
 * Lee el access_token de la cookie httpOnly
 */
export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Cookie httpOnly (método único de autenticación)
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE];

    if (!token) {
      res.status(401).json({
        error: 'No autorizado',
        message: 'No se proporcionó token de autenticación'
      });
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET no está configurado en las variables de entorno');
    }

    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as JWTPayload;
    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'No autorizado',
        message: 'Token inválido o expirado'
      });
      return;
    }

    console.error('Error en authMiddleware:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al verificar autenticación'
    });
  }
};
