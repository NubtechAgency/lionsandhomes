import { z } from 'zod';
import { EXPENSE_CATEGORIES, PROJECT_STATUSES } from '../lib/constants';

export const createProjectSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(200),
  description: z.string().max(1000).optional().nullable(),
  status: z.enum(PROJECT_STATUSES).optional().default('ACTIVE'),
  totalBudget: z.number().min(0, 'El presupuesto no puede ser negativo').optional().default(0),
  categoryBudgets: z.union([
    z.record(z.enum(EXPENSE_CATEGORIES), z.number().min(0)),
    z.string(), // Acepta JSON string (como llega del frontend)
  ]).optional().default({}),
  startDate: z.string().optional(),
  endDate: z.string().optional().nullable(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  status: z.enum(PROJECT_STATUSES).optional(),
  totalBudget: z.number().min(0).optional(),
  categoryBudgets: z.union([
    z.record(z.enum(EXPENSE_CATEGORIES), z.number().min(0)),
    z.string(),
  ]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional().nullable(),
});

export const listProjectsQuerySchema = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
});
