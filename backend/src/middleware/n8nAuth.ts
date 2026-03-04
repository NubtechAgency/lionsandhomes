// Middleware de autenticacion para n8n (timing-safe token comparison)
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Compara un token entrante con el esperado de forma timing-safe.
 * Retorna true si coinciden.
 */
function verifyToken(expected: string, incoming: string): boolean {
  const expectedBuf = Buffer.from(expected, 'utf8');
  const incomingBuf = Buffer.from(incoming, 'utf8');
  return expectedBuf.length === incomingBuf.length && crypto.timingSafeEqual(expectedBuf, incomingBuf);
}

/**
 * Middleware para sync de transacciones (POST /api/sync/transactions, GET /api/sync/status)
 * Header: X-N8N-Token — variable de entorno: N8N_SYNC_TOKEN
 */
export const n8nAuthMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const expectedToken = process.env.N8N_SYNC_TOKEN;

    if (!expectedToken) {
      console.error('N8N_SYNC_TOKEN no configurado');
      res.status(500).json({ error: 'Internal Server Error', message: 'Error de configuracion del servidor' });
      return;
    }

    const incomingToken = req.headers['x-n8n-token'] as string;
    if (!incomingToken) {
      res.status(401).json({ error: 'Unauthorized', message: 'Falta el header X-N8N-Token' });
      return;
    }

    if (!verifyToken(expectedToken, incomingToken)) {
      res.status(403).json({ error: 'Forbidden', message: 'Token invalido' });
      return;
    }

    next();
  } catch (error) {
    console.error('Error en n8nAuthMiddleware:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Error al verificar autenticacion' });
  }
};

/**
 * Middleware para subida de facturas desde Telegram (POST /api/sync/invoice)
 * Header: X-Invoice-Token — variable de entorno: N8N_INVOICE_TOKEN
 */
export const invoiceAuthMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const expectedToken = process.env.N8N_INVOICE_TOKEN;

    if (!expectedToken) {
      console.error('N8N_INVOICE_TOKEN no configurado');
      res.status(500).json({ error: 'Internal Server Error', message: 'Error de configuracion del servidor' });
      return;
    }

    const incomingToken = req.headers['x-invoice-token'] as string;
    if (!incomingToken) {
      res.status(401).json({ error: 'Unauthorized', message: 'Falta el header X-Invoice-Token' });
      return;
    }

    if (!verifyToken(expectedToken, incomingToken)) {
      res.status(403).json({ error: 'Forbidden', message: 'Token invalido' });
      return;
    }

    next();
  } catch (error) {
    console.error('Error en invoiceAuthMiddleware:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Error al verificar autenticacion' });
  }
};
