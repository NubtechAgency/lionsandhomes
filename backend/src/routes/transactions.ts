// 💰 Rutas de gestión de transacciones
import { Router } from 'express';
import {
  createTransaction,
  listTransactions,
  getTransaction,
  updateTransaction,
  archiveTransaction
} from '../controllers/transactionController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 🔐 Todas las rutas de transacciones requieren autenticación
router.use(authMiddleware);

/**
 * POST /api/transactions
 * Crear una transacción manual
 * Body: { date, amount, concept }
 */
router.post('/', createTransaction);

/**
 * GET /api/transactions
 * Listar transacciones con filtros y paginación
 * Query params: projectId, expenseCategory, hasInvoice, dateFrom, dateTo, isManual, search, limit, offset
 */
router.get('/', listTransactions);

/**
 * GET /api/transactions/:id
 * Obtener una transacción por ID
 */
router.get('/:id', getTransaction);

/**
 * PATCH /api/transactions/:id
 * Actualizar transacción (asignación manual)
 * Body: { projectId?, expenseCategory?, notes? }
 */
router.patch('/:id', updateTransaction);

/**
 * PATCH /api/transactions/:id/archive
 * Archivar/desarchivar transacción (toggle)
 */
router.patch('/:id/archive', archiveTransaction);

export default router;
