// 📊 Controller del Dashboard - KPIs y estadísticas
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

import { EXPENSE_CATEGORIES, INVOICE_EXEMPT_CATEGORIES } from './projectController';

/**
 * GET /api/dashboard/stats
 * Obtener estadísticas completas del dashboard
 * Query params opcionales: projectId (filtrar por proyecto específico)
 */
export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectIdParam = req.query.projectId as string | undefined;
    const projectId = projectIdParam ? parseInt(projectIdParam) : undefined;

    // ========================================
    // 1. KPIs GLOBALES
    // ========================================

    // Total de proyectos activos
    const totalActiveProjects = await prisma.project.count({
      where: { status: 'ACTIVE' },
    });

    // Calcular el rango del mes actual
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Total gastado en el mes actual
    let totalSpentThisMonth: number;
    if (projectId) {
      const result = await prisma.transactionProject.aggregate({
        where: {
          projectId,
          amount: { lt: 0 },
          transaction: { date: { gte: startOfMonth, lte: endOfMonth }, isArchived: false },
        },
        _sum: { amount: true },
      });
      totalSpentThisMonth = Math.abs(result._sum.amount || 0);
    } else {
      const result = await prisma.transaction.aggregate({
        where: { date: { gte: startOfMonth, lte: endOfMonth }, amount: { lt: 0 }, isArchived: false },
        _sum: { amount: true },
      });
      totalSpentThisMonth = Math.abs(result._sum.amount || 0);
    }

    // Total de transacciones sin factura (excluye categorías exentas: SUELDOS, PRESTAMOS)
    const totalWithoutInvoice = await prisma.transaction.count({
      where: {
        hasInvoice: false,
        amount: { lt: 0 },
        isArchived: false,
        expenseCategory: { notIn: [...INVOICE_EXEMPT_CATEGORIES] },
        ...(projectId && { allocations: { some: { projectId } } }),
      },
    });

    // Total de transacciones sin proyecto asignado
    const totalWithoutProject = await prisma.transaction.count({
      where: {
        allocations: { none: {} },
        amount: { lt: 0 },
        isArchived: false,
      },
    });

    // ========================================
    // 2. PRESUPUESTO VS GASTO (por categoría)
    // ========================================

    // Obtener proyectos activos (o uno específico)
    const projects = await prisma.project.findMany({
      where: {
        status: 'ACTIVE',
        ...(projectId && { id: projectId }),
      },
      select: {
        id: true,
        name: true,
        totalBudget: true,
        categoryBudgets: true,
      },
    });

    // Calcular presupuesto total por categoría (suma de todos los proyectos activos)
    const categoryBudgets: Record<string, number> = {};
    let totalBudget = 0;

    projects.forEach((project) => {
      totalBudget += project.totalBudget;
      const budgets = typeof project.categoryBudgets === 'string'
        ? JSON.parse(project.categoryBudgets)
        : (project.categoryBudgets as Record<string, number>);

      EXPENSE_CATEGORIES.forEach((category) => {
        if (!categoryBudgets[category]) {
          categoryBudgets[category] = 0;
        }
        categoryBudgets[category] += budgets[category] || 0;
      });
    });

    // Calcular gasto real por categoría
    const categoryExpenses: Record<string, number> = {};

    for (const category of EXPENSE_CATEGORIES) {
      let spent: number;
      if (projectId) {
        const result = await prisma.transactionProject.aggregate({
          where: {
            projectId,
            amount: { lt: 0 },
            transaction: { expenseCategory: category, isArchived: false },
          },
          _sum: { amount: true },
        });
        spent = Math.abs(result._sum.amount || 0);
      } else {
        const result = await prisma.transaction.aggregate({
          where: { expenseCategory: category, amount: { lt: 0 }, isArchived: false },
          _sum: { amount: true },
        });
        spent = Math.abs(result._sum.amount || 0);
      }
      categoryExpenses[category] = spent;
    }

    // Calcular totalSpent REAL (todas las transacciones, no solo las que tienen categoría)
    let totalSpent: number;
    if (projectId) {
      const result = await prisma.transactionProject.aggregate({
        where: { projectId, amount: { lt: 0 }, transaction: { isArchived: false } },
        _sum: { amount: true },
      });
      totalSpent = Math.abs(result._sum.amount || 0);
    } else {
      const result = await prisma.transaction.aggregate({
        where: { amount: { lt: 0 }, isArchived: false },
        _sum: { amount: true },
      });
      totalSpent = Math.abs(result._sum.amount || 0);
    }

    // Construir array de categorías con presupuesto vs gasto
    const categoryStats = EXPENSE_CATEGORIES.map((category) => {
      const budget = categoryBudgets[category] || 0;
      const spent = categoryExpenses[category] || 0;
      const percentage = budget > 0 ? (spent / budget) * 100 : 0;

      return {
        category,
        budget,
        spent,
        percentage: Math.round(percentage * 100) / 100, // 2 decimales
      };
    });

    // Porcentaje de presupuesto total consumido
    const totalBudgetPercentage =
      totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    // ========================================
    // 3. TRANSACCIONES RECIENTES
    // ========================================

    const recentTransactions = await prisma.transaction.findMany({
      where: {
        isArchived: false,
        ...(projectId && { allocations: { some: { projectId } } }),
      },
      take: 10,
      orderBy: {
        date: 'desc',
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        allocations: {
          include: {
            project: { select: { id: true, name: true } },
          },
        },
      },
    });

    // ========================================
    // 4. ALERTAS DE PRESUPUESTO (por proyecto y categoría)
    // ========================================

    const budgetAlerts: {
      projectId: number;
      projectName: string;
      category: string | null;
      budget: number;
      spent: number;
      percentage: number;
    }[] = [];

    for (const project of projects) {
      const budgets = typeof project.categoryBudgets === 'string'
        ? JSON.parse(project.categoryBudgets)
        : (project.categoryBudgets as Record<string, number>);

      // Gasto total del proyecto (desde allocations)
      const projectTotalExpenses = await prisma.transactionProject.aggregate({
        where: { projectId: project.id, amount: { lt: 0 }, transaction: { isArchived: false } },
        _sum: { amount: true },
      });
      const projectTotalSpent = Math.abs(projectTotalExpenses._sum.amount || 0);

      // Alerta si el proyecto total supera presupuesto
      if (project.totalBudget > 0 && projectTotalSpent > project.totalBudget) {
        budgetAlerts.push({
          projectId: project.id,
          projectName: project.name,
          category: null,
          budget: project.totalBudget,
          spent: projectTotalSpent,
          percentage: Math.round((projectTotalSpent / project.totalBudget) * 100),
        });
      }

      // Alerta por cada categoría que supere su presupuesto
      for (const cat of EXPENSE_CATEGORIES) {
        const catBudget = budgets[cat] || 0;
        if (catBudget <= 0) continue;

        const catExpenses = await prisma.transactionProject.aggregate({
          where: { projectId: project.id, amount: { lt: 0 }, transaction: { expenseCategory: cat, isArchived: false } },
          _sum: { amount: true },
        });
        const catSpent = Math.abs(catExpenses._sum.amount || 0);

        if (catSpent > catBudget) {
          budgetAlerts.push({
            projectId: project.id,
            projectName: project.name,
            category: cat,
            budget: catBudget,
            spent: catSpent,
            percentage: Math.round((catSpent / catBudget) * 100),
          });
        }
      }
    }

    // ========================================
    // 5. RESPUESTA FINAL
    // ========================================

    res.status(200).json({
      kpis: {
        totalActiveProjects,
        totalSpentThisMonth,
        totalWithoutInvoice,
        totalWithoutProject,
        totalBudget,
        totalSpent,
        totalBudgetPercentage: Math.round(totalBudgetPercentage * 100) / 100,
      },
      categoryStats,
      recentTransactions,
      budgetAlerts,
      filteredByProject: projectId
        ? projects.find((p) => p.id === projectId)?.name || null
        : null,
    });
  } catch (error) {
    console.error('Error al obtener estadísticas del dashboard:', error);
    res.status(500).json({
      error: 'Error al obtener estadísticas',
      message: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
};
