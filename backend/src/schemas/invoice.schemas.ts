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
