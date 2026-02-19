import { z } from 'zod';
import { EXPENSE_CATEGORIES } from '../lib/constants';

const allocationSchema = z.object({
  projectId: z.number().int().positive(),
  amount: z.number(),
});

export const createTransactionSchema = z.object({
  date: z.string().min(1, 'La fecha es requerida'),
  amount: z.number({ required_error: 'El importe es requerido' }),
  concept: z.string().min(1, 'El concepto es requerido').max(500),
  projectId: z.number().int().positive().optional().nullable(),
  allocations: z.array(allocationSchema).optional(),
  expenseCategory: z.enum(EXPENSE_CATEGORIES).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  isFixed: z.boolean().optional(),
});

export const updateTransactionSchema = z.object({
  date: z.string().min(1).optional(),
  amount: z.number().optional(),
  concept: z.string().min(1).max(500).optional(),
  projectId: z.number().int().positive().optional().nullable(),
  allocations: z.array(allocationSchema).optional(),
  expenseCategory: z.enum(EXPENSE_CATEGORIES).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  isFixed: z.boolean().optional(),
});

export const listTransactionsQuerySchema = z.object({
  projectId: z.string().optional(),
  expenseCategory: z.string().optional(),
  hasInvoice: z.enum(['true', 'false']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  isManual: z.enum(['true', 'false']).optional(),
  isArchived: z.string().optional(),
  isFixed: z.enum(['true', 'false']).optional(),
  search: z.string().max(200).optional(),
  amountMin: z.string().optional(),
  amountMax: z.string().optional(),
  amountType: z.enum(['expense', 'income']).optional(),
  sortBy: z.enum(['date', 'amount', 'concept']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
});

export const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID debe ser un número'),
});
