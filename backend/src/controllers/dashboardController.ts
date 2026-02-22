// Controller del Dashboard - KPIs y estadisticas
// Optimized: replaced N+1 loops with batched groupBy queries and Promise.all
import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { EXPENSE_CATEGORIES, INVOICE_EXEMPT_CATEGORIES } from './projectController';

/**
 * Safely parse categoryBudgets JSON string into a Record.
 * Returns empty object on parse failure.
 */
function safeParseBudgets(raw: unknown): Record<string, number> {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === 'object') {
    return raw as Record<string, number>;
  }
  return {};
}

/**
 * GET /api/dashboard/stats
 * Obtener estadisticas completas del dashboard
 * Query params opcionales: projectId (filtrar por proyecto especifico)
 */
export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectIdParam = req.query.projectId as string | undefined;
    const projectId = projectIdParam ? parseInt(projectIdParam) : undefined;

    // ========================================
    // 1. KPIs GLOBALES (run independent queries in parallel)
    // ========================================

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [
      totalActiveProjects,
      totalSpentThisMonthResult,
      totalWithoutInvoice,
      totalWithoutProject,
    ] = await Promise.all([
      // Total de proyectos activos (excluye "General")
      prisma.project.count({
        where: { status: 'ACTIVE', name: { not: 'General' } },
      }),

      // Total gastado en el mes actual
      projectId
        ? prisma.transactionProject.aggregate({
            where: {
              projectId,
              amount: { lt: 0 },
              transaction: { date: { gte: startOfMonth, lte: endOfMonth }, isArchived: false },
            },
            _sum: { amount: true },
          })
        : prisma.transaction.aggregate({
            where: { date: { gte: startOfMonth, lte: endOfMonth }, amount: { lt: 0 }, isArchived: false },
            _sum: { amount: true },
          }),

      // Total de transacciones sin factura (excluye categorias exentas)
      prisma.transaction.count({
        where: {
          hasInvoice: false,
          amount: { lt: 0 },
          isArchived: false,
          expenseCategory: { notIn: [...INVOICE_EXEMPT_CATEGORIES] },
          ...(projectId && { allocations: { some: { projectId } } }),
        },
      }),

      // Total de transacciones sin proyecto asignado
      prisma.transaction.count({
        where: {
          allocations: { none: {} },
          amount: { lt: 0 },
          isArchived: false,
        },
      }),
    ]);

    const totalSpentThisMonth = Math.abs(totalSpentThisMonthResult._sum.amount || 0);

    // ========================================
    // 2. PRESUPUESTO VS GASTO (por categoria)
    // ========================================

    // Obtener proyectos activos (o uno especifico), excluye "General"
    const projects = await prisma.project.findMany({
      where: {
        status: 'ACTIVE',
        name: { not: 'General' },
        ...(projectId && { id: projectId }),
      },
      select: {
        id: true,
        name: true,
        totalBudget: true,
        categoryBudgets: true,
      },
    });

    // Calcular presupuesto total por categoria (suma de todos los proyectos activos)
    const categoryBudgets: Record<string, number> = {};
    let totalBudget = 0;

    projects.forEach((project) => {
      totalBudget += project.totalBudget;
      const budgets = safeParseBudgets(project.categoryBudgets);

      EXPENSE_CATEGORIES.forEach((category) => {
        if (!categoryBudgets[category]) {
          categoryBudgets[category] = 0;
        }
        categoryBudgets[category] += budgets[category] || 0;
      });
    });

    // Calcular gasto real por categoria + fixed/variable totals
    // Using batched queries instead of N+1 loops
    const categoryExpenses: Record<string, number> = {};
    let totalFixedAmount = 0;
    let totalVariableAmount = 0;
    const fixedByCategoryMap: Record<string, number> = {};

    if (projectId) {
      // For a specific project, fetch all allocations in one query and group in JS
      const allocations = await prisma.transactionProject.findMany({
        where: {
          projectId,
          amount: { lt: 0 },
          transaction: { isArchived: false },
        },
        select: {
          amount: true,
          transaction: {
            select: { expenseCategory: true, isFixed: true },
          },
        },
      });

      allocations.forEach((a) => {
        const cat = a.transaction.expenseCategory;
        const absAmount = Math.abs(a.amount);

        if (cat) {
          categoryExpenses[cat] = (categoryExpenses[cat] || 0) + absAmount;
        }

        // Fixed vs variable
        if (a.transaction.isFixed) {
          totalFixedAmount += absAmount;
          if (cat) {
            fixedByCategoryMap[cat] = (fixedByCategoryMap[cat] || 0) + absAmount;
          }
        } else {
          totalVariableAmount += absAmount;
        }
      });
    } else {
      // Global: use groupBy queries (3 parallel queries instead of 8+8+8 sequential ones)
      const [categoryGrouped, fixedVarGrouped, fixedByCatGrouped] = await Promise.all([
        // Category expenses groupBy
        prisma.transaction.groupBy({
          by: ['expenseCategory'],
          where: { amount: { lt: 0 }, isArchived: false, expenseCategory: { not: null } },
          _sum: { amount: true },
        }),

        // Fixed vs variable groupBy
        prisma.transaction.groupBy({
          by: ['isFixed'],
          where: { amount: { lt: 0 }, isArchived: false },
          _sum: { amount: true },
        }),

        // Fixed expenses by category groupBy
        prisma.transaction.groupBy({
          by: ['expenseCategory'],
          where: { amount: { lt: 0 }, isArchived: false, isFixed: true, expenseCategory: { not: null } },
          _sum: { amount: true },
        }),
      ]);

      categoryGrouped.forEach((g) => {
        categoryExpenses[g.expenseCategory!] = Math.abs(g._sum.amount || 0);
      });

      fixedVarGrouped.forEach((g) => {
        if (g.isFixed) {
          totalFixedAmount = Math.abs(g._sum.amount || 0);
        } else {
          totalVariableAmount = Math.abs(g._sum.amount || 0);
        }
      });

      fixedByCatGrouped.forEach((g) => {
        fixedByCategoryMap[g.expenseCategory!] = Math.abs(g._sum.amount || 0);
      });
    }

    // Calcular totalSpent REAL (todas las transacciones, no solo las que tienen categoria)
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

    // Construir array de categorias con presupuesto vs gasto
    const categoryStats = EXPENSE_CATEGORIES.map((category) => {
      const budget = categoryBudgets[category] || 0;
      const spent = categoryExpenses[category] || 0;
      const percentage = budget > 0 ? (spent / budget) * 100 : 0;

      return {
        category,
        budget,
        spent,
        percentage: Math.round(percentage * 100) / 100,
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
    // 4. ALERTAS DE PRESUPUESTO (batched queries + JS computation)
    // ========================================

    const projectIds = projects.map((p) => p.id);

    // Fetch all spending data in 2 batched queries instead of N*(1+8) individual queries
    const [projectSpendingGrouped, projectCatAllocations] = await Promise.all([
      // Total spent per project (one groupBy for all projects)
      prisma.transactionProject.groupBy({
        by: ['projectId'],
        where: {
          amount: { lt: 0 },
          transaction: { isArchived: false },
          projectId: { in: projectIds },
        },
        _sum: { amount: true },
      }),

      // All allocations with category info for all projects (one findMany)
      prisma.transactionProject.findMany({
        where: {
          amount: { lt: 0 },
          transaction: { isArchived: false, expenseCategory: { not: null } },
          projectId: { in: projectIds },
        },
        select: {
          projectId: true,
          amount: true,
          transaction: { select: { expenseCategory: true } },
        },
      }),
    ]);

    // Build lookup maps from the batched results
    const projectTotalSpentMap: Record<number, number> = {};
    projectSpendingGrouped.forEach((g) => {
      projectTotalSpentMap[g.projectId] = Math.abs(g._sum.amount || 0);
    });

    // Per-project per-category spending map
    const projectCatSpentMap: Record<number, Record<string, number>> = {};
    projectCatAllocations.forEach((a) => {
      const pid = a.projectId;
      const cat = a.transaction.expenseCategory!;
      if (!projectCatSpentMap[pid]) {
        projectCatSpentMap[pid] = {};
      }
      projectCatSpentMap[pid][cat] = (projectCatSpentMap[pid][cat] || 0) + Math.abs(a.amount);
    });

    // Compute budget alerts from the maps (pure JS, no DB queries)
    const budgetAlerts: {
      projectId: number;
      projectName: string;
      category: string | null;
      budget: number;
      spent: number;
      percentage: number;
    }[] = [];

    for (const project of projects) {
      const budgets = safeParseBudgets(project.categoryBudgets);
      const projectTotalSpent = projectTotalSpentMap[project.id] || 0;

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

      // Alerta por cada categoria que supere su presupuesto
      const catSpending = projectCatSpentMap[project.id] || {};
      for (const cat of EXPENSE_CATEGORIES) {
        const catBudget = budgets[cat] || 0;
        if (catBudget <= 0) continue;

        const catSpent = catSpending[cat] || 0;
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
      totalFixed: totalFixedAmount,
      totalVariable: totalVariableAmount,
      fixedByCategory: fixedByCategoryMap,
      filteredByProject: projectId
        ? projects.find((p) => p.id === projectId)?.name || null
        : null,
    });
  } catch (error) {
    console.error('Error al obtener estadisticas del dashboard:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al obtener estadisticas del dashboard',
    });
  }
};
