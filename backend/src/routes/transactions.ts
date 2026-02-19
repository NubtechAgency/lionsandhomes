// Rutas de gestión de transacciones
import { Router } from 'express';
import {
  createTransaction,
  listTransactions,
  getTransaction,
  updateTransaction,
  archiveTransaction,
  checkDuplicates,
} from '../controllers/transactionController';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  createTransactionSchema,
  updateTransactionSchema,
  listTransactionsQuerySchema,
  idParamSchema,
} from '../schemas/transaction.schemas';

const router = Router();

// Todas las rutas de transacciones requieren autenticación
router.use(authMiddleware);

/**
 * POST /api/transactions
 * Crear una transacción manual
 */
router.post('/', validate(createTransactionSchema), createTransaction);

/**
 * GET /api/transactions
 * Listar transacciones con filtros y paginación
 */
router.get('/', validate(listTransactionsQuerySchema, 'query'), listTransactions);

/**
 * GET /api/transactions/check-duplicates
 * Comprobar si hay transacciones duplicadas
 */
router.get('/check-duplicates', checkDuplicates);

/**
 * GET /api/transactions/:id
 * Obtener una transacción por ID
 */
router.get('/:id', validate(idParamSchema, 'params'), getTransaction);

/**
 * PATCH /api/transactions/:id
 * Actualizar transacción (asignación manual)
 */
router.patch('/:id', validate(idParamSchema, 'params'), validate(updateTransactionSchema), updateTransaction);

/**
 * PATCH /api/transactions/:id/archive
 * Archivar/desarchivar transacción (toggle)
 */
router.patch('/:id/archive', validate(idParamSchema, 'params'), archiveTransaction);

export default router;
