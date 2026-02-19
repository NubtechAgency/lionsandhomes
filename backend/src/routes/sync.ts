// Rutas de sincronización con n8n
import { Router } from 'express';
import { syncTransactions, getSyncStatus } from '../controllers/syncController';
import { n8nAuthMiddleware } from '../middleware/n8nAuth';
import { validate } from '../middleware/validate';
import { syncTransactionsSchema } from '../schemas/sync.schemas';

const router = Router();

// Todas las rutas requieren token de n8n
router.use(n8nAuthMiddleware);

/**
 * POST /api/sync/transactions
 * Recibe transacciones desde n8n y las sincroniza con la BD
 */
router.post('/transactions', validate(syncTransactionsSchema), syncTransactions);

/**
 * GET /api/sync/status
 * Verificar que el servicio de sincronización está funcionando
 */
router.get('/status', getSyncStatus);

export default router;
