// Rutas de autenticación
import { Router } from 'express';
import { register, login, getCurrentUser } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * POST /api/auth/register
 * Crear un nuevo usuario
 * Body: { email, password, name }
 */
router.post('/register', register);

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
