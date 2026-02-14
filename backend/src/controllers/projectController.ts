// Controlador de gestión de proyectos
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Categorías de gasto de Lions (4 para proyectos + 1 global)
export const EXPENSE_CATEGORIES = [
  'MATERIAL_Y_MANO_DE_OBRA',
  'DECORACION',
  'COMPRA_Y_GASTOS',
  'OTROS',
  'GENERAL',
] as const;

/**
 * GET /api/projects
 * Listar todos los proyectos con filtro opcional por estado
 */
export const listProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.query;

    const where = status && typeof status === 'string'
      ? { status: status.toUpperCase() }
      : {};

    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { transactions: true }
        },
        transactions: {
          where: { amount: { lt: 0 }, isArchived: false },
          select: { amount: true }
        }
      }
    });

    // Parsear categoryBudgets y calcular totalSpent
    const projectsWithStats = projects.map(({ transactions, ...project }) => ({
      ...project,
      categoryBudgets: JSON.parse(project.categoryBudgets),
      totalSpent: transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    }));

    res.json({
      projects: projectsWithStats
    });
  } catch (error) {
    console.error('Error en listProjects:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al obtener proyectos'
    });
  }
};

/**
 * GET /api/projects/:id
 * Obtener un proyecto por ID con estadísticas
 */
export const getProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const projectId = parseInt(id);

    if (isNaN(projectId)) {
      res.status(400).json({
        error: 'ID inválido',
        message: 'El ID del proyecto debe ser un número'
      });
      return;
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        transactions: {
          where: {
            isArchived: false,
            amount: { lt: 0 }
          },
          select: {
            amount: true,
            hasInvoice: true,
            expenseCategory: true
          }
        }
      }
    });

    if (!project) {
      res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'No existe un proyecto con ese ID'
      });
      return;
    }

    // Calcular estadísticas
    const totalSpent = project.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const transactionsWithoutInvoice = project.transactions.filter(t => !t.hasInvoice).length;

    // Parsear categoryBudgets
    const categoryBudgets = JSON.parse(project.categoryBudgets);

    res.json({
      project: {
        ...project,
        categoryBudgets,
        stats: {
          totalSpent,
          transactionsCount: project.transactions.length,
          transactionsWithoutInvoice,
          budgetUsedPercentage: (totalSpent / project.totalBudget) * 100
        }
      }
    });
  } catch (error) {
    console.error('Error en getProject:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al obtener el proyecto'
    });
  }
};

/**
 * POST /api/projects
 * Crear un nuevo proyecto
 */
export const createProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, status, totalBudget, categoryBudgets, startDate, endDate } = req.body;

    // Validar campos requeridos
    if (!name || !totalBudget || !categoryBudgets || !startDate) {
      res.status(400).json({
        error: 'Datos incompletos',
        message: 'Nombre, presupuesto total, desglose de categorías y fecha de inicio son requeridos'
      });
      return;
    }

    // Validar que totalBudget sea un número positivo
    if (typeof totalBudget !== 'number' || totalBudget <= 0) {
      res.status(400).json({
        error: 'Presupuesto inválido',
        message: 'El presupuesto total debe ser un número positivo'
      });
      return;
    }

    // Validar categoryBudgets
    if (typeof categoryBudgets !== 'object') {
      res.status(400).json({
        error: 'Desglose inválido',
        message: 'El desglose de categorías debe ser un objeto'
      });
      return;
    }

    // Validar estado si se proporciona
    const validStatuses = ['ACTIVE', 'COMPLETED', 'ARCHIVED'];
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({
        error: 'Estado inválido',
        message: `El estado debe ser uno de: ${validStatuses.join(', ')}`
      });
      return;
    }

    // Crear el proyecto
    const project = await prisma.project.create({
      data: {
        name,
        description: description || null,
        status: status || 'ACTIVE',
        totalBudget,
        categoryBudgets: JSON.stringify(categoryBudgets),
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null
      }
    });

    res.status(201).json({
      message: 'Proyecto creado exitosamente',
      project: {
        ...project,
        categoryBudgets: JSON.parse(project.categoryBudgets)
      }
    });
  } catch (error) {
    console.error('Error en createProject:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al crear el proyecto'
    });
  }
};

/**
 * PATCH /api/projects/:id
 * Actualizar un proyecto existente
 */
export const updateProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const projectId = parseInt(id);

    if (isNaN(projectId)) {
      res.status(400).json({
        error: 'ID inválido',
        message: 'El ID del proyecto debe ser un número'
      });
      return;
    }

    const { name, description, status, totalBudget, categoryBudgets, startDate, endDate } = req.body;

    // Verificar que el proyecto existe
    const existingProject = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!existingProject) {
      res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'No existe un proyecto con ese ID'
      });
      return;
    }

    // Construir objeto de actualización solo con campos proporcionados
    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) {
      const validStatuses = ['ACTIVE', 'COMPLETED', 'ARCHIVED'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({
          error: 'Estado inválido',
          message: `El estado debe ser uno de: ${validStatuses.join(', ')}`
        });
        return;
      }
      updateData.status = status;
    }
    if (totalBudget !== undefined) {
      if (typeof totalBudget !== 'number' || totalBudget <= 0) {
        res.status(400).json({
          error: 'Presupuesto inválido',
          message: 'El presupuesto total debe ser un número positivo'
        });
        return;
      }
      updateData.totalBudget = totalBudget;
    }
    if (categoryBudgets !== undefined) {
      updateData.categoryBudgets = JSON.stringify(categoryBudgets);
    }
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;

    // Actualizar el proyecto
    const project = await prisma.project.update({
      where: { id: projectId },
      data: updateData
    });

    res.json({
      message: 'Proyecto actualizado exitosamente',
      project: {
        ...project,
        categoryBudgets: JSON.parse(project.categoryBudgets)
      }
    });
  } catch (error) {
    console.error('Error en updateProject:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al actualizar el proyecto'
    });
  }
};

/**
 * DELETE /api/projects/:id
 * Eliminar un proyecto
 */
export const deleteProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const projectId = parseInt(id);

    if (isNaN(projectId)) {
      res.status(400).json({
        error: 'ID inválido',
        message: 'El ID del proyecto debe ser un número'
      });
      return;
    }

    // Verificar que el proyecto existe
    const existingProject = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: {
          select: { transactions: true }
        }
      }
    });

    if (!existingProject) {
      res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'No existe un proyecto con ese ID'
      });
      return;
    }

    // Advertir si el proyecto tiene transacciones
    if (existingProject._count.transactions > 0) {
      res.status(400).json({
        error: 'Proyecto con transacciones',
        message: `Este proyecto tiene ${existingProject._count.transactions} transacciones asociadas. Elimina primero las transacciones o considera archivar el proyecto en su lugar.`
      });
      return;
    }

    // Eliminar el proyecto
    await prisma.project.delete({
      where: { id: projectId }
    });

    res.json({
      message: 'Proyecto eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error en deleteProject:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al eliminar el proyecto'
    });
  }
};
