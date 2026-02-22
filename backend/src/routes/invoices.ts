// Rutas de gestión de facturas (Cloudflare R2) - Multi-invoice + OCR bulk upload
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  uploadInvoice,
  getInvoiceUrls,
  deleteInvoice,
  bulkUploadInvoices,
  listOrphanInvoices,
  getInvoiceSuggestions,
  linkInvoiceToTransaction,
  updateOcrData,
  getOcrBudgetStatus,
} from '../controllers/invoiceController';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  invoiceParamSchema,
  invoiceIdParamSchema,
  orphanListQuerySchema,
  linkInvoiceBodySchema,
  updateOcrDataSchema,
} from '../schemas/invoice.schemas';

const router = Router();

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo PDF, JPG, PNG y WebP'));
    }
  },
});

// Multer para bulk upload (hasta 10 archivos)
const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo PDF, JPG, PNG y WebP'));
    }
  },
});

router.use(authMiddleware);

// === Rutas estáticas ANTES de parametrizadas ===

// POST /api/invoices/upload — Sube una factura (multipart) y la asocia a la transacción
router.post('/upload', (req: Request, res: Response, next: NextFunction): void => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: 'Archivo no válido', message: err.message });
      return;
    }
    next();
  });
}, uploadInvoice);

// POST /api/invoices/bulk-upload — Sube hasta 10 facturas con OCR automático
router.post('/bulk-upload', (req: Request, res: Response, next: NextFunction): void => {
  bulkUpload.array('files', 10)(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: 'Archivos no válidos', message: err.message });
      return;
    }
    next();
  });
}, bulkUploadInvoices);

// GET /api/invoices/orphans — Lista facturas huérfanas (sin transacción)
router.get('/orphans', validate(orphanListQuerySchema, 'query'), listOrphanInvoices);

// GET /api/invoices/ocr-budget — Estado del presupuesto OCR mensual
router.get('/ocr-budget', getOcrBudgetStatus);

// === Rutas parametrizadas ===

// GET /api/invoices/:transactionId — Obtiene todas las facturas con URLs de descarga
router.get('/:transactionId', validate(invoiceParamSchema, 'params'), getInvoiceUrls);

// DELETE /api/invoices/:invoiceId — Elimina una factura individual
router.delete('/:invoiceId', validate(invoiceIdParamSchema, 'params'), deleteInvoice);

// GET /api/invoices/:invoiceId/suggestions — Sugerencias de matching para huérfana
router.get('/:invoiceId/suggestions', validate(invoiceIdParamSchema, 'params'), getInvoiceSuggestions);

// PATCH /api/invoices/:invoiceId/ocr — Editar datos OCR extraídos
router.patch('/:invoiceId/ocr', validate(invoiceIdParamSchema, 'params'), validate(updateOcrDataSchema, 'body'), updateOcrData);

// PATCH /api/invoices/:invoiceId/link — Vincular factura huérfana a transacción
router.patch('/:invoiceId/link', validate(invoiceIdParamSchema, 'params'), validate(linkInvoiceBodySchema, 'body'), linkInvoiceToTransaction);

export default router;
