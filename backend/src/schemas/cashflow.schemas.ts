import { z } from 'zod';
import { EXPENSE_CATEGORIES, CASH_FLOW_TYPES } from '../lib/constants';

export const createCashFlowEntrySchema = z.object({
  type: z.enum(CASH_FLOW_TYPES),
  description: z.string().min(1, 'La descripción es requerida').max(500),
  amount: z.number().positive('El importe debe ser positivo'),
  date: z.string().min(1, 'La fecha es requerida'),
  category: z.enum(EXPENSE_CATEGORIES).optional().nullable(),
  projectId: z.number().int().positive().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
}).refine(
  (data) => data.type === 'INCOME' || data.category,
  { message: 'La categoría es requerida para pagos', path: ['category'] }
);

export const updateCashFlowEntrySchema = z.object({
  type: z.enum(CASH_FLOW_TYPES).optional(),
  description: z.string().min(1).max(500).optional(),
  amount: z.number().positive().optional(),
  date: z.string().min(1).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional().nullable(),
  projectId: z.number().int().positive().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const listCashFlowQuerySchema = z.object({
  type: z.enum(CASH_FLOW_TYPES).optional(),
  projectId: z.string().optional(),
  category: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sortBy: z.enum(['date', 'amount', 'description']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
});
