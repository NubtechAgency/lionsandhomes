// Middleware de autenticación JWT
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
 * Middleware que verifica que el usuario esté autenticado
 * Extrae el token JWT del header Authorization y verifica su validez
 */
export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Obtener el token del header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        error: 'No autorizado',
        message: 'No se proporcionó token de autenticación'
      });
      return;
    }

    // El formato debe ser: "Bearer TOKEN"
    const token = authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({
        error: 'No autorizado',
        message: 'Formato de token inválido'
      });
      return;
    }

    // Verificar el token
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET no está configurado en las variables de entorno');
    }

    const decoded = jwt.verify(token, secret) as JWTPayload;

    // Agregar el userId al request para que esté disponible en las rutas
    req.userId = decoded.userId;

    // Continuar con la siguiente función
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
