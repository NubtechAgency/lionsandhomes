import { z } from 'zod';

const incomingTransactionSchema = z.object({
  externalId: z.string().min(1),
  date: z.string().min(1),
  amount: z.number(),
  concept: z.string().min(1),
  category: z.string().optional().default('Uncategorized'),
});

export const syncTransactionsSchema = z.object({
  transactions: z.array(incomingTransactionSchema),
});
