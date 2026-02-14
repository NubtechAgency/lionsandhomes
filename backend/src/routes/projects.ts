// Rutas de gestión de proyectos
import { Router } from 'express';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject
} from '../controllers/projectController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Todas las rutas de proyectos requieren autenticación
router.use(authMiddleware);

/**
 * GET /api/projects
 * Listar todos los proyectos
 * Query params: status (optional) - filtrar por ACTIVE, COMPLETED, ARCHIVED
 */
router.get('/', listProjects);

/**
 * GET /api/projects/:id
 * Obtener un proyecto por ID con estadísticas
 */
router.get('/:id', getProject);

/**
 * POST /api/projects
 * Crear un nuevo proyecto
 * Body: { name, description?, status?, totalBudget, categoryBudgets, startDate, endDate? }
 */
router.post('/', createProject);

/**
 * PATCH /api/projects/:id
 * Actualizar un proyecto existente
 * Body: campos a actualizar
 */
router.patch('/:id', updateProject);

/**
 * DELETE /api/projects/:id
 * Eliminar un proyecto (solo si no tiene transacciones)
 */
router.delete('/:id', deleteProject);

export default router;
