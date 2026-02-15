// Rutas de gestión de facturas (Cloudflare R2) - Multi-invoice
import { Router } from 'express';
import multer from 'multer';
import {
  uploadInvoice,
  getInvoiceUrls,
  deleteInvoice,
} from '../controllers/invoiceController';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authMiddleware);

// POST /api/invoices/upload — Sube una factura (multipart) y la asocia a la transacción
router.post('/upload', upload.single('file'), uploadInvoice);

// GET /api/invoices/:transactionId — Obtiene todas las facturas con URLs de descarga
router.get('/:transactionId', getInvoiceUrls);

// DELETE /api/invoices/:invoiceId — Elimina una factura individual
router.delete('/:invoiceId', deleteInvoice);

export default router;
