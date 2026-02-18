// 💰 Controlador de gestión de transacciones
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { EXPENSE_CATEGORIES, INVOICE_EXEMPT_CATEGORIES } from './projectController';

const prisma = new PrismaClient();

/**
 * POST /api/transactions
 * Crear una transacción manual (gastos en efectivo, etc.)
 */
export const createTransaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, amount, concept, projectId, allocations: bodyAllocations, expenseCategory, notes, isFixed } = req.body;

    if (!date || amount === undefined || !concept) {
      res.status(400).json({
        error: 'Campos requeridos',
        message: 'Se requiere date, amount y concept',
      });
      return;
    }

    if (typeof amount !== 'number' || isNaN(amount)) {
      res.status(400).json({
        error: 'Importe inválido',
        message: 'El importe debe ser un número',
      });
      return;
    }

    // Validar allocations si se proporcionan (multi-proyecto)
    if (bodyAllocations && Array.isArray(bodyAllocations) && bodyAllocations.length > 0) {
      const allocSum = bodyAllocations.reduce((s: number, a: any) => s + a.amount, 0);
      if (Math.abs(allocSum - amount) > 0.01) {
        res.status(400).json({
          error: 'Suma incorrecta',
          message: 'La suma de las asignaciones debe ser igual al importe de la transacción',
        });
        return;
      }
      for (const alloc of bodyAllocations) {
        const p = await prisma.project.findUnique({ where: { id: alloc.projectId } });
        if (!p) {
          res.status(400).json({ error: 'Proyecto inválido', message: `El proyecto ${alloc.projectId} no existe` });
          return;
        }
      }
    } else if (projectId) {
      // Validar projectId si se proporciona (single project)
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        res.status(400).json({
          error: 'Proyecto inválido',
          message: 'El proyecto especificado no existe',
        });
        return;
      }
    }

    // Validar expenseCategory si se proporciona
    if (expenseCategory && !EXPENSE_CATEGORIES.includes(expenseCategory)) {
      res.status(400).json({
        error: 'Categoría inválida',
        message: `La categoría debe ser una de: ${EXPENSE_CATEGORIES.join(', ')}`,
      });
      return;
    }

    // Auto-sync por concepto: si no se proporcionó categoría/tipo, heredar de transacciones existentes
    let syncedCategory = expenseCategory || null;
    let syncedIsFixed = isFixed ?? false;

    if (!expenseCategory || isFixed === undefined) {
      const existing = await prisma.transaction.findFirst({
        where: {
          concept: concept,
          expenseCategory: { not: null },
        },
        select: { expenseCategory: true, isFixed: true },
      });

      if (existing) {
        if (!expenseCategory) syncedCategory = existing.expenseCategory;
        if (isFixed === undefined) syncedIsFixed = existing.isFixed;
      }
    }

    // Determinar projectId denormalizado
    const effectiveProjectId = bodyAllocations?.length > 0
      ? bodyAllocations[0].projectId
      : (projectId || null);

    const transaction = await prisma.transaction.create({
      data: {
        date: new Date(date),
        amount,
        concept,
        category: 'Manual',
        isManual: true,
        projectId: effectiveProjectId,
        expenseCategory: syncedCategory,
        isFixed: syncedIsFixed,
        notes: notes || null,
      },
    });

    // Crear allocations en TransactionProject
    if (bodyAllocations && Array.isArray(bodyAllocations) && bodyAllocations.length > 0) {
      await prisma.transactionProject.createMany({
        data: bodyAllocations.map((a: any) => ({
          transactionId: transaction.id,
          projectId: a.projectId,
          amount: a.amount,
        })),
      });
    } else if (projectId) {
      await prisma.transactionProject.create({
        data: {
          transactionId: transaction.id,
          projectId,
          amount,
        },
      });
    }

    // Re-fetch con includes completos
    const fullTransaction = await prisma.transaction.findUnique({
      where: { id: transaction.id },
      include: {
        project: { select: { id: true, name: true } },
        allocations: { include: { project: { select: { id: true, name: true } } } },
        invoices: true,
      },
    });

    res.status(201).json({
      message: 'Transacción manual creada exitosamente',
      transaction: fullTransaction,
    });
  } catch (error) {
    console.error('Error en createTransaction:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al crear la transacción',
    });
  }
};

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
      amountType,
      sortBy,
      sortOrder,
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
      where.allocations = { none: {} }; // Transactions without any project allocation
    } else if (projectId) {
      where.allocations = { some: { projectId: parseInt(projectId as string) } };
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

    // Filtro por tipo de importe: solo gastos o solo ingresos
    if (amountType === 'expense') {
      where.amount = { ...where.amount, lt: 0 };
    } else if (amountType === 'income') {
      where.amount = { ...where.amount, gte: 0 };
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
        },
        allocations: {
          include: {
            project: { select: { id: true, name: true } }
          }
        },
        invoices: true,
      },
      orderBy: sortBy === 'amount'
        ? { amount: sortOrder === 'asc' ? 'asc' : 'desc' }
        : sortBy === 'concept'
        ? { concept: sortOrder === 'asc' ? 'asc' : 'desc' }
        : { date: sortOrder === 'asc' ? 'asc' : 'desc' },
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
      prisma.transaction.count({ where: { ...expensesOnly, hasInvoice: false, expenseCategory: { notIn: [...INVOICE_EXEMPT_CATEGORIES] } } }),
      prisma.transaction.count({ where: { ...expensesOnly, allocations: { none: {} } } }),
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
        },
        allocations: {
          include: {
            project: { select: { id: true, name: true } }
          }
        },
        invoices: true,
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

    const { projectId, allocations: bodyAllocations, expenseCategory, notes, isFixed, date, amount, concept } = req.body;

    // 🔍 Verificar que la transacción existe
    const existingTransaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { allocations: true },
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

    // Campos editables solo para transacciones manuales
    if (existingTransaction.isManual) {
      if (date !== undefined) {
        const parsed = new Date(date);
        if (!isNaN(parsed.getTime())) {
          updateData.date = parsed;
        }
      }
      if (amount !== undefined && typeof amount === 'number' && !isNaN(amount)) {
        updateData.amount = amount;
      }
      if (concept !== undefined && typeof concept === 'string' && concept.trim()) {
        updateData.concept = concept.trim();
      }
    }

    // Manejar allocations (multi-proyecto)
    if (bodyAllocations && Array.isArray(bodyAllocations)) {
      if (bodyAllocations.length > 0) {
        // Validar que todos los proyectos existen
        for (const alloc of bodyAllocations) {
          const p = await prisma.project.findUnique({ where: { id: alloc.projectId } });
          if (!p) {
            res.status(400).json({ error: 'Proyecto inválido', message: `El proyecto ${alloc.projectId} no existe` });
            return;
          }
        }
        // Validar suma = importe de la transacción
        const txAmount = amount !== undefined ? amount : existingTransaction.amount;
        const allocSum = bodyAllocations.reduce((s: number, a: any) => s + a.amount, 0);
        if (Math.abs(allocSum - txAmount) > 0.01) {
          res.status(400).json({
            error: 'Suma incorrecta',
            message: 'La suma de las asignaciones debe ser igual al importe de la transacción',
          });
          return;
        }
        // Reemplazar allocations: borrar existentes, crear nuevas
        await prisma.transactionProject.deleteMany({ where: { transactionId } });
        await prisma.transactionProject.createMany({
          data: bodyAllocations.map((a: any) => ({
            transactionId,
            projectId: a.projectId,
            amount: a.amount,
          })),
        });
        // Denormalize: projectId = primer allocation
        updateData.projectId = bodyAllocations[0].projectId;
      } else {
        // allocations = [] → quitar todas las asignaciones
        await prisma.transactionProject.deleteMany({ where: { transactionId } });
        updateData.projectId = null;
      }
    } else if (projectId !== undefined) {
      // Inline dropdown: single project change
      await prisma.transactionProject.deleteMany({ where: { transactionId } });
      if (projectId !== null) {
        const txAmount = amount !== undefined ? amount : existingTransaction.amount;
        await prisma.transactionProject.create({
          data: { transactionId, projectId, amount: txAmount },
        });
      }
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
        },
        allocations: {
          include: {
            project: { select: { id: true, name: true } }
          }
        },
        invoices: true,
      }
    });

    // 🔄 Auto-sync: actualizar todas las transacciones con el mismo concepto (solo isFixed y expenseCategory)
    const syncData: any = {};
    if (isFixed !== undefined) syncData.isFixed = isFixed;
    if (expenseCategory !== undefined) syncData.expenseCategory = expenseCategory === null ? null : expenseCategory;

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

/**
 * GET /api/transactions/check-duplicates
 * Comprobar si hay transacciones duplicadas en la base de datos
 */
export const checkDuplicates = async (_req: Request, res: Response): Promise<void> => {
  try {
    const allTx = await prisma.transaction.findMany({
      where: { isArchived: false },
      select: { id: true, date: true, amount: true, concept: true, externalId: true, isManual: true },
      orderBy: { date: 'desc' },
    });

    // 1. Duplicados por externalId
    const extIdMap: Record<string, number[]> = {};
    allTx.forEach(t => {
      if (t.externalId) {
        if (!extIdMap[t.externalId]) extIdMap[t.externalId] = [];
        extIdMap[t.externalId].push(t.id);
      }
    });
    const externalIdDuplicates = Object.entries(extIdMap)
      .filter(([, ids]) => ids.length > 1)
      .map(([externalId, ids]) => ({ externalId, count: ids.length, ids }));

    // 2. Misma fecha + importe
    const dateAmountMap: Record<string, typeof allTx> = {};
    allTx.forEach(t => {
      const key = `${new Date(t.date).toISOString().slice(0, 10)}|${t.amount}`;
      if (!dateAmountMap[key]) dateAmountMap[key] = [];
      dateAmountMap[key].push(t);
    });
    const dateAmountDuplicates = Object.entries(dateAmountMap)
      .filter(([, txs]) => txs.length > 1)
      .map(([key, txs]) => {
        const [date, amount] = key.split('|');
        return {
          date,
          amount: parseFloat(amount),
          count: txs.length,
          transactions: txs.map(t => ({
            id: t.id,
            concept: t.concept,
            externalId: t.externalId,
            isManual: t.isManual,
          })),
        };
      });

    // 3. Duplicados exactos: fecha + importe + concepto
    const exactMap: Record<string, typeof allTx> = {};
    allTx.forEach(t => {
      const key = `${new Date(t.date).toISOString().slice(0, 10)}|${t.amount}|${t.concept.trim().toLowerCase()}`;
      if (!exactMap[key]) exactMap[key] = [];
      exactMap[key].push(t);
    });
    const exactDuplicates = Object.entries(exactMap)
      .filter(([, txs]) => txs.length > 1)
      .map(([, txs]) => ({
        date: new Date(txs[0].date).toISOString().slice(0, 10),
        amount: txs[0].amount,
        concept: txs[0].concept,
        count: txs.length,
        ids: txs.map(t => t.id),
      }));

    res.json({
      total: allTx.length,
      externalIdDuplicates: {
        count: externalIdDuplicates.length,
        items: externalIdDuplicates,
      },
      dateAmountDuplicates: {
        count: dateAmountDuplicates.length,
        items: dateAmountDuplicates,
      },
      exactDuplicates: {
        count: exactDuplicates.length,
        items: exactDuplicates,
      },
    });
  } catch (error) {
    console.error('Error en checkDuplicates:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al comprobar duplicados',
    });
  }
};
