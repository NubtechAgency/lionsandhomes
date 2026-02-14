// 🔐 Middleware de autenticación para n8n
import { Request, Response, NextFunction } from 'express';

/**
 * Middleware para verificar que las peticiones vienen desde n8n
 *
 * n8n debe enviar un header:
 * X-N8N-Token: valor_del_token_secreto
 *
 * Este token se configura en el .env como N8N_SYNC_TOKEN
 */
export const n8nAuthMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // 🔑 Obtener el token secreto configurado en el .env
    const expectedToken = process.env.N8N_SYNC_TOKEN;

    // ⚠️ Verificar que el token está configurado
    if (!expectedToken) {
      console.error('N8N_SYNC_TOKEN no está configurado en el archivo .env');
      res.status(500).json({
        error: 'Configuration Error',
        message: 'Token de n8n no configurado en el servidor',
      });
      return;
    }

    // 📨 Obtener el token que n8n envía en el header
    const incomingToken = req.headers['x-n8n-token'] as string;

    // ❌ Si no viene el token en el header
    if (!incomingToken) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Falta el token de autenticación. Incluye el header X-N8N-Token',
      });
      return;
    }

    // 🔍 Verificar que el token coincide
    if (incomingToken !== expectedToken) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Token de autenticación inválido',
      });
      return;
    }

    // ✅ Token válido - continuar con el siguiente middleware o controlador
    next();
  } catch (error) {
    console.error('Error en middleware n8nAuth:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al verificar autenticación',
    });
  }
};
