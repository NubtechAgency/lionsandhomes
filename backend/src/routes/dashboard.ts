// 📊 Rutas del Dashboard
import { Router } from 'express';
import { getDashboardStats } from '../controllers/dashboardController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// GET /api/dashboard/stats - Obtener estadísticas completas
router.get('/stats', getDashboardStats);

export default router;
