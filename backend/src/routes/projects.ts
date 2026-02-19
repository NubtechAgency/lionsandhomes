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
import { validate } from '../middleware/validate';
import {
  createProjectSchema,
  updateProjectSchema,
  listProjectsQuerySchema,
} from '../schemas/project.schemas';
import { idParamSchema } from '../schemas/transaction.schemas';

const router = Router();

// Todas las rutas de proyectos requieren autenticación
router.use(authMiddleware);

/**
 * GET /api/projects
 * Listar todos los proyectos
 */
router.get('/', validate(listProjectsQuerySchema, 'query'), listProjects);

/**
 * GET /api/projects/:id
 * Obtener un proyecto por ID con estadísticas
 */
router.get('/:id', validate(idParamSchema, 'params'), getProject);

/**
 * POST /api/projects
 * Crear un nuevo proyecto
 */
router.post('/', validate(createProjectSchema), createProject);

/**
 * PATCH /api/projects/:id
 * Actualizar un proyecto existente
 */
router.patch('/:id', validate(idParamSchema, 'params'), validate(updateProjectSchema), updateProject);

/**
 * DELETE /api/projects/:id
 * Eliminar un proyecto (solo si no tiene transacciones)
 */
router.delete('/:id', validate(idParamSchema, 'params'), deleteProject);

export default router;
