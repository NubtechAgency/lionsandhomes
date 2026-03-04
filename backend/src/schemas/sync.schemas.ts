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
