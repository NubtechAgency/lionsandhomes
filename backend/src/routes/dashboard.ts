// Rutas del Dashboard
import { Router } from 'express';
import { getDashboardStats } from '../controllers/dashboardController';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { dashboardQuerySchema } from '../schemas/dashboard.schemas';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// GET /api/dashboard/stats - Obtener estadísticas completas
router.get('/stats', validate(dashboardQuerySchema, 'query'), getDashboardStats);

export default router;
