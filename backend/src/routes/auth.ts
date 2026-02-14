// Rutas de autenticación
import { Router } from 'express';
import { login, getCurrentUser } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * POST /api/auth/login
 * Iniciar sesión
 * Body: { email, password }
 * Response: { user, token }
 */
router.post('/login', login);

/**
 * GET /api/auth/me
 * Obtener datos del usuario autenticado
 * Headers: Authorization: Bearer {token}
 * Response: { user }
 */
router.get('/me', authMiddleware, getCurrentUser);

export default router;
