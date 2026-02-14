// 📄 Rutas de gestión de facturas (Cloudflare R2)
import { Router } from 'express';
import multer from 'multer';
import {
  getUploadUrl,
  uploadInvoice,
  attachInvoice,
  getInvoiceUrl,
  deleteInvoice,
} from '../controllers/invoiceController';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// 🔐 Todas las rutas de facturas requieren autenticación
router.use(authMiddleware);

/**
 * POST /api/invoices/upload
 * Sube una factura via multipart y la asocia a la transacción
 * Body: multipart/form-data con 'file' y 'transactionId'
 */
router.post('/upload', upload.single('file'), uploadInvoice);

/**
 * POST /api/invoices/upload-url
 * Genera una URL firmada para subir una factura a R2
 * Body: { transactionId: number, fileName: string }
 */
router.post('/upload-url', getUploadUrl);

/**
 * PATCH /api/transactions/:id/attach-invoice
 * Asocia una factura subida a una transacción
 * Body: { key: string, fileName: string }
 */
router.patch('/transactions/:id/attach-invoice', attachInvoice);

/**
 * DELETE /api/invoices/transactions/:id
 * Elimina la factura de una transacción (borra de R2 y limpia DB)
 */
router.delete('/transactions/:id', deleteInvoice);

/**
 * GET /api/invoices/:transactionId
 * Obtiene la URL de descarga de una factura
 */
router.get('/:transactionId', getInvoiceUrl);

export default router;
