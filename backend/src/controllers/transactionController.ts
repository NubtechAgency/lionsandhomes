// Controlador de gestión de transacciones
import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { INVOICE_EXEMPT_CATEGORIES } from './projectController';
import { logAudit, getClientIp } from '../services/auditLog';
import { flagDuplicatesForIds, scanAllDuplicates } from '../services/duplicateDetection';

/**
 * POST /api/transactions
 * Crear una transacción manual (gastos en efectivo, etc.)
 */
export const createTransaction = async (req: Request, res: Response): Promise<void> => {
  try {
    // Zod ya validó: date, amount (number), concept (string min 1), expenseCategory (enum), etc.
    const { date, amount, concept, projectId, allocations: bodyAllocations, expenseCategory, notes, isFixed } = req.body;

    // Validar allocations si se proporcionan (multi-proyecto) — lógica de negocio
    if (bodyAllocations && Array.isArray(bodyAllocations) && bodyAllocations.length > 0) {
      const allocSum = bodyAllocations.reduce((s: number, a: any) => s + a.amount, 0);
      if (Math.abs(allocSum - amount) > 0.01) {
        res.status(400).json({
          error: 'Suma incorrecta',
          message: 'La suma de las asignaciones debe ser igual al importe de la transacción',
        });
        return;
      }
      const projectIds = bodyAllocations.map((a: any) => a.projectId);
      const foundProjects = await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true } });
      const foundIds = new Set(foundProjects.map(p => p.id));
      for (const alloc of bodyAllocations) {
        if (!foundIds.has(alloc.projectId)) {
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

    const transaction = await prisma.$transaction(async (tx) => {
      const txn = await tx.transaction.create({
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

      if (bodyAllocations && Array.isArray(bodyAllocations) && bodyAllocations.length > 0) {
        await tx.transactionProject.createMany({
          data: bodyAllocations.map((a: any) => ({
            transactionId: txn.id,
            projectId: a.projectId,
            amount: a.amount,
          })),
        });
      } else if (projectId) {
        await tx.transactionProject.create({
          data: {
            transactionId: txn.id,
            projectId,
            amount,
          },
        });
      }

      return tx.transaction.findUnique({
        where: { id: txn.id },
        include: {
          project: { select: { id: true, name: true } },
          allocations: { include: { project: { select: { id: true, name: true } } } },
          invoices: true,
        },
      });
    });

    // Detección de duplicados por contenido
    try {
      await flagDuplicatesForIds([transaction!.id]);
    } catch (err) {
      console.error('Error en detección de duplicados:', err);
    }

    // Re-fetch para incluir needsReview actualizado
    const finalTransaction = await prisma.transaction.findUnique({
      where: { id: transaction!.id },
      include: {
        project: { select: { id: true, name: true } },
        allocations: { include: { project: { select: { id: true, name: true } } } },
        invoices: true,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'Transaction', entityId: transaction!.id, userId: req.userId, details: { amount, concept }, ipAddress: getClientIp(req) });

    res.status(201).json({
      message: 'Transacción manual creada exitosamente',
      transaction: finalTransaction,
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
      needsReview,
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

    if (needsReview !== undefined) {
      where.needsReview = needsReview === 'true';
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
      take: Math.min(parseInt(limit as string) || 50, 1000),
      skip: Math.max(parseInt(offset as string) || 0, 0)
    });

    // Contar total para paginación + stats agregados (solo gastos para KPIs)
    const expensesOnly: any = { ...where };
    if (where.amount) {
      expensesOnly.amount = { ...where.amount, lt: 0 };
    } else {
      expensesOnly.amount = { lt: 0 };
    }

    const [total, totalExpensesAgg, withoutInvoiceCount, unassignedCount, pendingReviewCount] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.aggregate({ where: expensesOnly, _sum: { amount: true } }),
      prisma.transaction.count({ where: { ...expensesOnly, hasInvoice: false, expenseCategory: { notIn: [...INVOICE_EXEMPT_CATEGORIES] } } }),
      prisma.transaction.count({ where: { ...expensesOnly, allocations: { none: {} } } }),
      prisma.transaction.count({ where: { isArchived: false, needsReview: true } }),
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
        pendingReview: pendingReviewCount,
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

    // Buscar transacción
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
    const { projectId, allocations: bodyAllocations, expenseCategory, notes, isFixed, needsReview: needsReviewBody, date, amount, concept } = req.body;

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

    // Actualizar expenseCategory (Zod ya validó el enum)
    if (expenseCategory !== undefined) {
      updateData.expenseCategory = expenseCategory;
    }

    // Actualizar notes
    if (notes !== undefined) {
      updateData.notes = notes || null;
    }

    // Actualizar isFixed
    if (isFixed !== undefined) {
      updateData.isFixed = isFixed;
    }

    // Actualizar needsReview (aprobar/desmarcar posible duplicado)
    if (needsReviewBody !== undefined) {
      updateData.needsReview = needsReviewBody;
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

    // Manejar allocations + actualizar transacción atómicamente
    const transaction = await prisma.$transaction(async (tx) => {
      // Allocations
      if (bodyAllocations && Array.isArray(bodyAllocations)) {
        if (bodyAllocations.length > 0) {
          // Validar que todos los proyectos existen
          for (const alloc of bodyAllocations) {
            const p = await tx.project.findUnique({ where: { id: alloc.projectId } });
            if (!p) throw new Error(`INVALID_PROJECT:${alloc.projectId}`);
          }
          const txAmount = amount !== undefined ? amount : existingTransaction.amount;
          const allocSum = bodyAllocations.reduce((s: number, a: any) => s + a.amount, 0);
          if (Math.abs(allocSum - txAmount) > 0.01) throw new Error('ALLOC_SUM_MISMATCH');

          await tx.transactionProject.deleteMany({ where: { transactionId } });
          await tx.transactionProject.createMany({
            data: bodyAllocations.map((a: any) => ({ transactionId, projectId: a.projectId, amount: a.amount })),
          });
          updateData.projectId = bodyAllocations[0].projectId;
        } else {
          await tx.transactionProject.deleteMany({ where: { transactionId } });
          updateData.projectId = null;
        }
      } else if (projectId !== undefined) {
        await tx.transactionProject.deleteMany({ where: { transactionId } });
        if (projectId !== null) {
          const txAmount = amount !== undefined ? amount : existingTransaction.amount;
          await tx.transactionProject.create({ data: { transactionId, projectId, amount: txAmount } });
        }
      }

      return tx.transaction.update({
        where: { id: transactionId },
        data: updateData,
        include: {
          project: { select: { id: true, name: true } },
          allocations: { include: { project: { select: { id: true, name: true } } } },
          invoices: true,
        },
      });
    });

    // 🔄 Auto-sync: actualizar transacciones con el mismo concepto (solo isFixed y expenseCategory)
    // Limitado a 500 para prevenir corrupción masiva accidental
    const syncData: any = {};
    if (isFixed !== undefined) syncData.isFixed = isFixed;
    if (expenseCategory !== undefined) syncData.expenseCategory = expenseCategory === null ? null : expenseCategory;

    let syncedCount = 0;
    if (Object.keys(syncData).length > 0 && existingTransaction.concept) {
      // Verificar cuántas se verían afectadas antes de aplicar
      const affectedCount = await prisma.transaction.count({
        where: {
          concept: existingTransaction.concept,
          id: { not: transactionId },
          isArchived: false,
        },
      });

      if (affectedCount <= 500) {
        const result = await prisma.transaction.updateMany({
          where: {
            concept: existingTransaction.concept,
            id: { not: transactionId },
            isArchived: false,
          },
          data: syncData,
        });
        syncedCount = result.count;
      } else {
        console.warn(`Auto-sync bloqueado: ${affectedCount} transacciones con concepto "${existingTransaction.concept}" excede límite de 500`);
      }
    }

    await logAudit({ action: 'UPDATE', entityType: 'Transaction', entityId: transactionId, userId: req.userId, details: { ...updateData, syncedCount }, ipAddress: getClientIp(req) });

    res.json({
      message: syncedCount > 0
        ? `Transacción actualizada y ${syncedCount} más con el mismo concepto`
        : 'Transacción actualizada exitosamente',
      transaction,
      syncedCount,
    });
  } catch (error: any) {
    if (error?.message?.startsWith('INVALID_PROJECT:')) {
      const pid = error.message.split(':')[1];
      res.status(400).json({ error: 'Proyecto inválido', message: `El proyecto ${pid} no existe` });
      return;
    }
    if (error?.message === 'ALLOC_SUM_MISMATCH') {
      res.status(400).json({ error: 'Suma incorrecta', message: 'La suma de las asignaciones debe ser igual al importe de la transacción' });
      return;
    }
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

    // Auto-clear: si archivamos un duplicado y solo queda 1 en su grupo, limpiar el flag
    if (updated.isArchived && updated.needsReview && updated.duplicateGroupId) {
      const remainingInGroup = await prisma.transaction.count({
        where: {
          duplicateGroupId: updated.duplicateGroupId,
          needsReview: true,
          isArchived: false,
          id: { not: transactionId },
        },
      });
      if (remainingInGroup === 1) {
        await prisma.transaction.updateMany({
          where: {
            duplicateGroupId: updated.duplicateGroupId,
            needsReview: true,
            isArchived: false,
          },
          data: { needsReview: false },
        });
      }
    }

    await logAudit({ action: updated.isArchived ? 'ARCHIVE' : 'UNARCHIVE', entityType: 'Transaction', entityId: transactionId, userId: req.userId, ipAddress: getClientIp(req) });

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
      take: 10000, // Límite para prevenir OOM en datasets grandes
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

/**
 * POST /api/transactions/scan-duplicates
 * Escanea todas las transacciones existentes y marca duplicados por contenido
 * (fecha ±1 día + importe + concepto). Acción única para datos históricos.
 */
/**
 * POST /api/transactions/archive-duplicates
 * Archiva todos los duplicados excepto uno por grupo (conserva el más antiguo).
 * Auto-limpia needsReview del que queda.
 */
export const archiveDuplicates = async (req: Request, res: Response): Promise<void> => {
  try {
    // Obtener todas las transacciones pendientes de revisión, agrupadas por duplicateGroupId
    const flagged = await prisma.transaction.findMany({
      where: { needsReview: true, duplicateGroupId: { not: null }, isArchived: false },
      select: { id: true, duplicateGroupId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Agrupar por duplicateGroupId
    const groups = new Map<string, number[]>();
    for (const t of flagged) {
      const gid = t.duplicateGroupId!;
      if (!groups.has(gid)) groups.set(gid, []);
      groups.get(gid)!.push(t.id);
    }

    let archived = 0;
    let cleared = 0;

    for (const [, ids] of groups) {
      if (ids.length < 2) {
        // Solo 1 en el grupo — limpiar flag sin archivar
        await prisma.transaction.updateMany({
          where: { id: { in: ids } },
          data: { needsReview: false },
        });
        cleared += ids.length;
        continue;
      }
      // Conservar el primero (más antiguo por createdAt), archivar el resto
      const [keep, ...toArchive] = ids;
      await prisma.transaction.updateMany({
        where: { id: { in: toArchive } },
        data: { isArchived: true, needsReview: false },
      });
      // Limpiar flag del que queda
      await prisma.transaction.update({
        where: { id: keep },
        data: { needsReview: false },
      });
      archived += toArchive.length;
      cleared++;
    }

    await logAudit({
      action: 'ARCHIVE_DUPLICATES', entityType: 'Transaction',
      details: { groups: groups.size, archived, cleared },
      userId: req.userId, ipAddress: getClientIp(req),
    });

    res.json({
      message: `${archived} duplicados archivados, ${cleared} transacciones conservadas`,
      archived,
      cleared,
      groups: groups.size,
    });
  } catch (error) {
    console.error('Error en archiveDuplicates:', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al archivar duplicados' });
  }
};

export const scanDuplicates = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await scanAllDuplicates();

    await logAudit({ action: 'SCAN_DUPLICATES', entityType: 'Transaction', details: result, userId: req.userId, ipAddress: getClientIp(req) });

    res.json({
      message: `Escaneo completado: ${result.flagged} transacciones marcadas en ${result.groups} grupos`,
      ...result,
    });
  } catch (error) {
    console.error('Error en scanDuplicates:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al escanear duplicados',
    });
  }
};
