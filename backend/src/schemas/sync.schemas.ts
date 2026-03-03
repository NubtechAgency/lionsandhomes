import { z } from 'zod';

const incomingTransactionSchema = z.object({
  externalId: z.string().min(1).max(500),
  date: z.string().min(1),
  amount: z.number(),
  concept: z.string().min(1).max(500),
  category: z.string().max(200).optional().default('Uncategorized'),
  projectId: z.number().int().positive().nullable().optional(),
});

export const syncTransactionsSchema = z.object({
  transactions: z.array(incomingTransactionSchema).max(5000),
});

// Telegram invoice upload (campos de texto del form multipart)
// n8n ya ejecuta OCR con Claude Sonnet y envía los datos extraídos
export const telegramInvoiceSchema = z.object({
  amount: z.string().optional(),             // "123.45" — parseFloat en controller
  date: z.string().max(10).optional(),       // "2025-03-01" ISO
  vendor: z.string().max(500).optional(),
  invoiceNumber: z.string().max(200).optional(),
});
