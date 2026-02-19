// Rutas de gestión de facturas (Cloudflare R2) - Multi-invoice
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  uploadInvoice,
  getInvoiceUrls,
  deleteInvoice,
} from '../controllers/invoiceController';
import { authMiddleware } from '../middleware/auth';

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

router.use(authMiddleware);

// POST /api/invoices/upload — Sube una factura (multipart) y la asocia a la transacción
// Wrapper para capturar errores de multer (fileFilter) y devolver 400 en vez de 500
router.post('/upload', (req: Request, res: Response, next: NextFunction): void => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: 'Archivo no válido', message: err.message });
      return;
    }
    next();
  });
}, uploadInvoice);

// GET /api/invoices/:transactionId — Obtiene todas las facturas con URLs de descarga
router.get('/:transactionId', getInvoiceUrls);

// DELETE /api/invoices/:invoiceId — Elimina una factura individual
router.delete('/:invoiceId', deleteInvoice);

export default router;
