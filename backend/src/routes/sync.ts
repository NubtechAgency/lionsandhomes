// 🔄 Rutas de sincronización con n8n
import { Router } from 'express';
import { syncTransactions, getSyncStatus } from '../controllers/syncController';
import { n8nAuthMiddleware } from '../middleware/n8nAuth';

const router = Router();

/**
 * 🔐 TODAS LAS RUTAS REQUIEREN TOKEN DE N8N
 * n8n debe enviar el header: X-N8N-Token: valor_del_token_secreto
 */
router.use(n8nAuthMiddleware);

/**
 * POST /api/sync/transactions
 * Recibe un array de transacciones desde n8n y las sincroniza con la BD
 *
 * Body esperado:
 * {
 *   "transactions": [
 *     {
 *       "externalId": "1784264579626750110--beb4407e088e8dad5b6b27d4719e1588",
 *       "date": "2026-02-06T00:00:00.000Z",
 *       "amount": -115,
 *       "concept": "COMPRA TARJ. 5540XXXXXXXX5013 LEROY MERLIN",
 *       "category": "Uncategorized"
 *     }
 *   ]
 * }
 *
 * Respuesta:
 * {
 *   "message": "Sincronización completada",
 *   "stats": {
 *     "total": 10,
 *     "created": 5,
 *     "updated": 3,
 *     "skipped": 2
 *   }
 * }
 */
router.post('/transactions', syncTransactions);

/**
 * GET /api/sync/status
 * Verificar que el servicio de sincronización está funcionando
 * Útil para debugging y monitoreo
 */
router.get('/status', getSyncStatus);

export default router;
