// 💰 Controlador de gestión de transacciones
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { EXPENSE_CATEGORIES } from './projectController';

const prisma = new PrismaClient();

/**
 * GET /api/transactions
 * Listar transacciones con filtros y paginación
 */
export const listTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      projectId,
      expenseCategory,
      hasInvoice,
      dateFrom,
      dateTo,
      isManual,
      isArchived,
      isFixed,
      search,
      amountMin,
      amountMax,
      limit = '50',
      offset = '0'
    } = req.query;

    // 🔍 Construir objeto where dinámico para filtros
    const where: any = {};

    // Por defecto ocultar archivadas, mostrar solo si se pide explícitamente
    if (isArchived === 'true') {
      where.isArchived = true;
    } else if (isArchived === 'all') {
      // No filtrar, mostrar todas
    } else {
      where.isArchived = false;
    }

    if (projectId === 'none') {
      where.projectId = null; // Filter transactions without project
    } else if (projectId) {
      where.projectId = parseInt(projectId as string);
    }

    if (expenseCategory) {
      where.expenseCategory = expenseCategory as string;
    }

    if (hasInvoice !== undefined) {
      where.hasInvoice = hasInvoice === 'true';
    }

    if (isManual !== undefined) {
      where.isManual = isManual === 'true';
    }

    if (isFixed !== undefined) {
      where.isFixed = isFixed === 'true';
    }

    // Filtro de rango de importe (valor absoluto - se invierte el signo porque gastos son negativos)
    if (amountMin || amountMax) {
      where.amount = { ...where.amount };
      if (amountMin) where.amount.lte = -parseFloat(amountMin as string);
      if (amountMax) where.amount.gte = -parseFloat(amountMax as string);
    }

    // Filtro de rango de fechas
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom as string);
      if (dateTo) where.date.lte = new Date(dateTo as string);
    }

    // Búsqueda en concepto (case-insensitive en PostgreSQL)
    if (search && typeof search === 'string') {
      where.concept = {
        contains: search,
        mode: 'insensitive',
      };
    }

    // 📊 Obtener transacciones con paginación
    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { date: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string)
    });

    // Contar total para paginación + stats agregados (solo gastos para KPIs)
    const expensesOnly: any = { ...where };
    if (where.amount) {
      expensesOnly.amount = { ...where.amount, lt: 0 };
    } else {
      expensesOnly.amount = { lt: 0 };
    }

    const [total, totalExpensesAgg, withoutInvoiceCount, unassignedCount] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.aggregate({ where: expensesOnly, _sum: { amount: true } }),
      prisma.transaction.count({ where: { ...expensesOnly, hasInvoice: false } }),
      prisma.transaction.count({ where: { ...expensesOnly, projectId: null } }),
    ]);

    res.json({
      transactions,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + transactions.length < total
      },
      stats: {
        totalExpenses: Math.abs(totalExpensesAgg._sum.amount || 0),
        withoutInvoice: withoutInvoiceCount,
        unassigned: unassignedCount,
      }
    });
  } catch (error) {
    console.error('Error en listTransactions:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al obtener transacciones'
    });
  }
};

/**
 * GET /api/transactions/:id
 * Obtener detalle de una transacción por ID
 */
export const getTransaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const transactionId = parseInt(req.params.id as string);

    // ✅ Validar ID numérico
    if (isNaN(transactionId)) {
      res.status(400).json({
        error: 'ID inválido',
        message: 'El ID de la transacción debe ser un número'
      });
      return;
    }

    // 🔍 Buscar transacción
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        project: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!transaction) {
      res.status(404).json({
        error: 'Transacción no encontrada',
        message: 'No existe una transacción con ese ID'
      });
      return;
    }

    res.json({ transaction });
  } catch (error) {
    console.error('Error en getTransaction:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al obtener la transacción'
    });
  }
};

/**
 * PATCH /api/transactions/:id
 * Actualizar transacción (asignación manual de proyecto, categoría, notas)
 */
export const updateTransaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const transactionId = parseInt(req.params.id as string);

    // ✅ Validar ID numérico
    if (isNaN(transactionId)) {
      res.status(400).json({
        error: 'ID inválido',
        message: 'El ID de la transacción debe ser un número'
      });
      return;
    }

    const { projectId, expenseCategory, notes, isFixed } = req.body;

    // 🔍 Verificar que la transacción existe
    const existingTransaction = await prisma.transaction.findUnique({
      where: { id: transactionId }
    });

    if (!existingTransaction) {
      res.status(404).json({
        error: 'Transacción no encontrada',
        message: 'No existe una transacción con ese ID'
      });
      return;
    }

    // 📝 Construir objeto de actualización
    const updateData: any = {};

    // ✅ Validar y actualizar projectId
    if (projectId !== undefined) {
      if (projectId === null) {
        updateData.projectId = null;
      } else {
        const project = await prisma.project.findUnique({
          where: { id: projectId }
        });

        if (!project) {
          res.status(400).json({
            error: 'Proyecto inválido',
            message: 'El proyecto especificado no existe'
          });
          return;
        }

        updateData.projectId = projectId;
      }
    }

    // ✅ Validar y actualizar expenseCategory
    if (expenseCategory !== undefined) {
      if (expenseCategory === null) {
        updateData.expenseCategory = null;
      } else {
        if (!EXPENSE_CATEGORIES.includes(expenseCategory)) {
          res.status(400).json({
            error: 'Categoría inválida',
            message: `La categoría debe ser una de: ${EXPENSE_CATEGORIES.join(', ')}`
          });
          return;
        }

        updateData.expenseCategory = expenseCategory;
      }
    }

    // Actualizar notes
    if (notes !== undefined) {
      updateData.notes = notes || null;
    }

    // Actualizar isFixed
    if (isFixed !== undefined) {
      updateData.isFixed = isFixed;
    }

    // 💾 Actualizar la transacción en la BD
    const transaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: updateData,
      include: {
        project: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // 🔄 Auto-sync: actualizar todas las transacciones con el mismo concepto (solo isFixed y projectId)
    const syncData: any = {};
    if (isFixed !== undefined) syncData.isFixed = isFixed;
    if (projectId !== undefined) syncData.projectId = projectId === null ? null : projectId;

    let syncedCount = 0;
    if (Object.keys(syncData).length > 0 && existingTransaction.concept) {
      const result = await prisma.transaction.updateMany({
        where: {
          concept: existingTransaction.concept,
          id: { not: transactionId },
        },
        data: syncData,
      });
      syncedCount = result.count;
    }

    res.json({
      message: syncedCount > 0
        ? `Transacción actualizada y ${syncedCount} más con el mismo concepto`
        : 'Transacción actualizada exitosamente',
      transaction,
      syncedCount,
    });
  } catch (error) {
    console.error('Error en updateTransaction:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al actualizar la transacción'
    });
  }
};

/**
 * PATCH /api/transactions/:id/archive
 * Archivar o desarchivar una transacción (toggle)
 * Las transacciones NUNCA se borran, solo se archivan
 */
export const archiveTransaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const transactionId = parseInt(req.params.id as string);

    if (isNaN(transactionId)) {
      res.status(400).json({
        error: 'ID inválido',
        message: 'El ID de la transacción debe ser un número'
      });
      return;
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId }
    });

    if (!transaction) {
      res.status(404).json({
        error: 'Transacción no encontrada',
        message: 'No existe una transacción con ese ID'
      });
      return;
    }

    // Toggle: si está archivada la desarchiva, si no lo está la archiva
    const updated = await prisma.transaction.update({
      where: { id: transactionId },
      data: { isArchived: !transaction.isArchived },
      include: {
        project: { select: { id: true, name: true } }
      }
    });

    res.json({
      message: updated.isArchived ? 'Transacción archivada' : 'Transacción desarchivada',
      transaction: updated
    });
  } catch (error) {
    console.error('Error en archiveTransaction:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al archivar la transacción'
    });
  }
};
