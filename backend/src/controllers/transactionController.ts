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
      search,
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

    // Filtro de rango de fechas
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom as string);
      if (dateTo) where.date.lte = new Date(dateTo as string);
    }

    // Búsqueda en concepto (SQLite LIKE es case-insensitive por defecto)
    if (search && typeof search === 'string') {
      where.concept = {
        contains: search,
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

    // Contar total para paginación
    const total = await prisma.transaction.count({ where });

    res.json({
      transactions,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + transactions.length < total
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
    const { id } = req.params;
    const transactionId = parseInt(id);

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
    const { id } = req.params;
    const transactionId = parseInt(id);

    // ✅ Validar ID numérico
    if (isNaN(transactionId)) {
      res.status(400).json({
        error: 'ID inválido',
        message: 'El ID de la transacción debe ser un número'
      });
      return;
    }

    const { projectId, expenseCategory, notes } = req.body;

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

    res.json({
      message: 'Transacción actualizada exitosamente',
      transaction
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
    const { id } = req.params;
    const transactionId = parseInt(id);

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
