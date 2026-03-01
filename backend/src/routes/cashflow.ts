// Rutas de previsiones de flujo de caja
import { Router } from 'express';
import {
  createEntry,
  listEntries,
  getSummary,
  getEntry,
  updateEntry,
  deleteEntry,
} from '../controllers/cashflowController';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  createCashFlowEntrySchema,
  updateCashFlowEntrySchema,
  listCashFlowQuerySchema,
} from '../schemas/cashflow.schemas';
import { idParamSchema } from '../schemas/transaction.schemas';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// GET /api/cashflow — listar entradas con filtros
router.get('/', validate(listCashFlowQuerySchema, 'query'), listEntries);

// GET /api/cashflow/summary — agregados mensuales para gráfico
router.get('/summary', validate(listCashFlowQuerySchema, 'query'), getSummary);

// POST /api/cashflow — crear entrada
router.post('/', validate(createCashFlowEntrySchema), createEntry);

// GET /api/cashflow/:id — obtener entrada
router.get('/:id', validate(idParamSchema, 'params'), getEntry);

// PATCH /api/cashflow/:id — actualizar entrada
router.patch('/:id', validate(idParamSchema, 'params'), validate(updateCashFlowEntrySchema), updateEntry);

// DELETE /api/cashflow/:id — eliminar entrada
router.delete('/:id', validate(idParamSchema, 'params'), deleteEntry);

export default router;
