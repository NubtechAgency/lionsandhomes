import { z } from 'zod';
import { CASH_FLOW_TYPES } from '../lib/constants';

export const createCashFlowEntrySchema = z.object({
  type: z.enum(CASH_FLOW_TYPES),
  description: z.string().min(1, 'La descripción es requerida').max(500),
  amount: z.number().positive('El importe debe ser positivo'),
  date: z.string().min(1, 'La fecha es requerida'),
  projectId: z.number().int().positive().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateCashFlowEntrySchema = z.object({
  type: z.enum(CASH_FLOW_TYPES).optional(),
  description: z.string().min(1).max(500).optional(),
  amount: z.number().positive().optional(),
  date: z.string().min(1).optional(),
  projectId: z.number().int().positive().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const listCashFlowQuerySchema = z.object({
  type: z.enum(CASH_FLOW_TYPES).optional(),
  projectId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sortBy: z.enum(['date', 'amount', 'description']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
});

// Batch creation: array of entries, max 200
export const batchCreateCashFlowSchema = z.object({
  entries: z.array(
    z.object({
      type: z.enum(CASH_FLOW_TYPES),
      description: z.string().min(1).max(500),
      amount: z.number().positive(),
      date: z.string().min(1),
      projectId: z.number().int().positive().optional().nullable(),
      notes: z.string().max(1000).optional().nullable(),
    })
  ).min(1, 'Se requiere al menos una entrada').max(200, 'Máximo 200 entradas por lote'),
});
