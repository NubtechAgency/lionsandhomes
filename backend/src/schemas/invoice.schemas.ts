import { z } from 'zod';

export const uploadInvoiceBodySchema = z.object({
  transactionId: z.string().regex(/^\d+$/, 'transactionId debe ser un número'),
});

export const invoiceParamSchema = z.object({
  transactionId: z.string().regex(/^\d+$/, 'transactionId debe ser un número'),
});

export const invoiceIdParamSchema = z.object({
  invoiceId: z.string().regex(/^\d+$/, 'invoiceId debe ser un número'),
});

// === OCR / Bulk upload schemas ===

export const orphanListQuerySchema = z.object({
  ocrStatus: z.enum(['NONE', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'BUDGET_EXCEEDED']).optional(),
  search: z.string().max(200).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
});

export const linkInvoiceBodySchema = z.object({
  transactionId: z.number().int().positive('transactionId debe ser un entero positivo'),
});

export const updateOcrDataSchema = z.object({
  ocrAmount: z.number().positive().optional(),
  ocrDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha: YYYY-MM-DD').optional(),
  ocrVendor: z.string().max(500).optional(),
  ocrInvoiceNumber: z.string().max(200).optional(),
});
