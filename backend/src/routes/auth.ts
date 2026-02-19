// Rutas de autenticación (httpOnly cookies)
import { Router } from 'express';
import { login, refresh, logout, getCurrentUser } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { loginSchema } from '../schemas/auth.schemas';

const router = Router();

/**
 * POST /api/auth/login
 * Iniciar sesión — setea cookies httpOnly
 */
router.post('/login', validate(loginSchema), login);

/**
 * POST /api/auth/refresh
 * Rotar refresh token + nuevo access token (NO requiere auth middleware)
 */
router.post('/refresh', refresh);

/**
 * POST /api/auth/logout
 * Invalidar refresh token + limpiar cookies
 * NO requiere auth middleware: si el access token expiró (15min idle),
 * el usuario debe poder cerrar sesión igualmente usando el refresh token.
 */
router.post('/logout', logout);

/**
 * GET /api/auth/me
 * Obtener datos del usuario autenticado
 */
router.get('/me', authMiddleware, getCurrentUser);

export default router;
