// Rutas de sincronización con n8n + Telegram invoice upload
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { syncTransactions, getSyncStatus, telegramUploadInvoice } from '../controllers/syncController';
import { n8nAuthMiddleware, invoiceAuthMiddleware } from '../middleware/n8nAuth';
import { validate } from '../middleware/validate';
import { syncTransactionsSchema } from '../schemas/sync.schemas';
import { ALLOWED_MIME_TYPES } from '../lib/fileValidation';

const router = Router();

// Multer para subida de factura desde Telegram (memory storage, 10MB max)
const telegramUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if ((ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo PDF, JPG, PNG y WebP'));
    }
  },
});

/**
 * POST /api/sync/transactions — Auth: X-N8N-Token (N8N_SYNC_TOKEN)
 * Recibe transacciones desde n8n y las sincroniza con la BD
 */
router.post('/transactions', n8nAuthMiddleware, validate(syncTransactionsSchema), syncTransactions);

/**
 * GET /api/sync/status — Auth: X-N8N-Token (N8N_SYNC_TOKEN)
 * Verificar que el servicio de sincronización está funcionando
 */
router.get('/status', n8nAuthMiddleware, getSyncStatus);

/**
 * POST /api/sync/invoice — Auth: X-Invoice-Token (N8N_INVOICE_TOKEN)
 * Recibe una factura desde Telegram vía n8n (multipart/form-data).
 * El backend ejecuta OCR con Claude Vision y auto-asigna si score >= 95.
 */
router.post('/invoice', invoiceAuthMiddleware, (req: Request, res: Response, next: NextFunction): void => {
  telegramUpload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: 'Archivo no válido', message: err.message });
      return;
    }
    next();
  });
}, telegramUploadInvoice);

export default router;
