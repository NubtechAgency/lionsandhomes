// Rutas de sincronización con n8n + Telegram invoice upload
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { syncTransactions, getSyncStatus, telegramUploadInvoice } from '../controllers/syncController';
import { n8nAuthMiddleware } from '../middleware/n8nAuth';
import { validate } from '../middleware/validate';
import { syncTransactionsSchema, telegramInvoiceSchema } from '../schemas/sync.schemas';
import { ALLOWED_MIME_TYPES } from '../lib/fileValidation';

const router = Router();

// Multer para subida de factura individual desde Telegram
const telegramUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if ((ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo PDF, JPG, PNG y WebP'));
    }
  },
});

// Todas las rutas requieren token de n8n
router.use(n8nAuthMiddleware);

/**
 * POST /api/sync/transactions
 * Recibe transacciones desde n8n y las sincroniza con la BD
 */
router.post('/transactions', validate(syncTransactionsSchema), syncTransactions);

/**
 * GET /api/sync/status
 * Verificar que el servicio de sincronización está funcionando
 */
router.get('/status', getSyncStatus);

/**
 * POST /api/sync/invoice
 * Recibe una factura desde Telegram vía n8n.
 * Sube a R2, ejecuta OCR, busca matches y auto-asigna si score >= 95.
 */
router.post('/invoice', (req: Request, res: Response, next: NextFunction): void => {
  telegramUpload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: 'Archivo no válido', message: err.message });
      return;
    }
    next();
  });
}, validate(telegramInvoiceSchema), telegramUploadInvoice);

export default router;
