// Controlador de previsiones de flujo de caja
import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { logAudit, getClientIp } from '../services/auditLog';

/**
 * POST /api/cashflow
 * Crear una entrada de flujo de caja
 */
export const createEntry = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, description, amount, date, category, projectId, notes } = req.body;

    // Verificar que el proyecto existe si se proporciona
    if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        res.status(404).json({ error: 'Proyecto no encontrado', message: 'No existe un proyecto con ese ID' });
        return;
      }
    }

    const entry = await prisma.cashFlowEntry.create({
      data: {
        type,
        description,
        amount,
        date: new Date(date),
        category: category || null,
        projectId: projectId || null,
        notes: notes || null,
      },
      include: { project: { select: { id: true, name: true } } },
    });

    await logAudit({
      action: 'CREATE',
      entityType: 'CashFlowEntry',
      entityId: entry.id,
      userId: req.userId,
      details: { type, description, amount },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ message: 'Entrada creada exitosamente', entry });
  } catch (error) {
    console.error('Error en createEntry (cashflow):', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al crear la entrada' });
  }
};

/**
 * GET /api/cashflow
 * Listar entradas con filtros y paginación
 */
export const listEntries = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, projectId, category, dateFrom, dateTo, sortBy, sortOrder, limit, offset } = req.query;

    const where: any = {};

    if (type) where.type = type;
    if (category) where.category = category;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom as string);
      if (dateTo) where.date.lte = new Date(dateTo as string);
    }
    if (projectId) {
      if (projectId === 'none') {
        where.projectId = null;
      } else {
        where.projectId = parseInt(projectId as string);
      }
    }

    const orderBy: any = {};
    orderBy[sortBy as string || 'date'] = (sortOrder as string) || 'desc';

    const take = limit ? parseInt(limit as string) : 50;
    const skip = offset ? parseInt(offset as string) : 0;

    const [entries, total] = await Promise.all([
      prisma.cashFlowEntry.findMany({
        where,
        orderBy,
        take,
        skip,
        include: { project: { select: { id: true, name: true } } },
      }),
      prisma.cashFlowEntry.count({ where }),
    ]);

    // Calcular stats agregados con los mismos filtros
    const allFiltered = await prisma.cashFlowEntry.findMany({
      where,
      select: { type: true, amount: true },
    });

    const totalIncome = allFiltered
      .filter(e => e.type === 'INCOME')
      .reduce((sum, e) => sum + e.amount, 0);
    const totalExpense = allFiltered
      .filter(e => e.type === 'EXPENSE')
      .reduce((sum, e) => sum + e.amount, 0);

    res.json({
      entries,
      pagination: { total, limit: take, offset: skip, hasMore: skip + take < total },
      stats: { totalIncome, totalExpense, net: totalIncome - totalExpense },
    });
  } catch (error) {
    console.error('Error en listEntries (cashflow):', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al obtener entradas' });
  }
};

/**
 * GET /api/cashflow/summary
 * Agregados mensuales para el gráfico
 */
export const getSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, projectId, category, dateFrom, dateTo } = req.query;

    const where: any = {};
    if (type) where.type = type;
    if (category) where.category = category;
    if (projectId) {
      if (projectId === 'none') {
        where.projectId = null;
      } else {
        where.projectId = parseInt(projectId as string);
      }
    }
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom as string);
      if (dateTo) where.date.lte = new Date(dateTo as string);
    }

    const entries = await prisma.cashFlowEntry.findMany({
      where,
      select: { type: true, amount: true, date: true },
      orderBy: { date: 'asc' },
    });

    // Agrupar por mes
    const monthMap = new Map<string, { income: number; expense: number }>();

    for (const entry of entries) {
      const d = new Date(entry.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { income: 0, expense: 0 });
      }
      const bucket = monthMap.get(monthKey)!;
      if (entry.type === 'INCOME') {
        bucket.income += entry.amount;
      } else {
        bucket.expense += entry.amount;
      }
    }

    // Generar meses continuos entre el primero y el último
    const sortedKeys = Array.from(monthMap.keys()).sort();
    if (sortedKeys.length === 0) {
      res.json({ months: [] });
      return;
    }

    const allMonths: string[] = [];
    const [startYear, startMonth] = sortedKeys[0].split('-').map(Number);
    const [endYear, endMonth] = sortedKeys[sortedKeys.length - 1].split('-').map(Number);

    let y = startYear;
    let m = startMonth;
    while (y < endYear || (y === endYear && m <= endMonth)) {
      allMonths.push(`${y}-${String(m).padStart(2, '0')}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }

    // Construir respuesta con acumulado
    let cumulative = 0;
    const months = allMonths.map(month => {
      const data = monthMap.get(month) || { income: 0, expense: 0 };
      const net = data.income - data.expense;
      cumulative += net;
      return {
        month,
        income: Math.round(data.income * 100) / 100,
        expense: Math.round(data.expense * 100) / 100,
        net: Math.round(net * 100) / 100,
        cumulative: Math.round(cumulative * 100) / 100,
      };
    });

    res.json({ months });
  } catch (error) {
    console.error('Error en getSummary (cashflow):', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al obtener resumen' });
  }
};

/**
 * GET /api/cashflow/:id
 * Obtener una entrada por ID
 */
export const getEntry = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);

    const entry = await prisma.cashFlowEntry.findUnique({
      where: { id },
      include: { project: { select: { id: true, name: true } } },
    });

    if (!entry) {
      res.status(404).json({ error: 'Entrada no encontrada', message: 'No existe una entrada con ese ID' });
      return;
    }

    res.json({ entry });
  } catch (error) {
    console.error('Error en getEntry (cashflow):', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al obtener la entrada' });
  }
};

/**
 * PATCH /api/cashflow/:id
 * Actualizar una entrada
 */
export const updateEntry = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const { type, description, amount, date, category, projectId, notes } = req.body;

    const existing = await prisma.cashFlowEntry.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Entrada no encontrada', message: 'No existe una entrada con ese ID' });
      return;
    }

    // Verificar proyecto si se proporciona
    if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        res.status(404).json({ error: 'Proyecto no encontrado', message: 'No existe un proyecto con ese ID' });
        return;
      }
    }

    const updateData: any = {};
    if (type !== undefined) updateData.type = type;
    if (description !== undefined) updateData.description = description;
    if (amount !== undefined) updateData.amount = amount;
    if (date !== undefined) updateData.date = new Date(date);
    if (category !== undefined) updateData.category = category;
    if (projectId !== undefined) updateData.projectId = projectId;
    if (notes !== undefined) updateData.notes = notes;

    const entry = await prisma.cashFlowEntry.update({
      where: { id },
      data: updateData,
      include: { project: { select: { id: true, name: true } } },
    });

    await logAudit({
      action: 'UPDATE',
      entityType: 'CashFlowEntry',
      entityId: id,
      userId: req.userId,
      ipAddress: getClientIp(req),
    });

    res.json({ message: 'Entrada actualizada exitosamente', entry });
  } catch (error) {
    console.error('Error en updateEntry (cashflow):', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al actualizar la entrada' });
  }
};

/**
 * DELETE /api/cashflow/:id
 * Eliminar una entrada (hard delete)
 */
export const deleteEntry = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);

    const existing = await prisma.cashFlowEntry.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Entrada no encontrada', message: 'No existe una entrada con ese ID' });
      return;
    }

    await prisma.cashFlowEntry.delete({ where: { id } });

    await logAudit({
      action: 'DELETE',
      entityType: 'CashFlowEntry',
      entityId: id,
      userId: req.userId,
      details: { description: existing.description, type: existing.type },
      ipAddress: getClientIp(req),
    });

    res.json({ message: 'Entrada eliminada exitosamente' });
  } catch (error) {
    console.error('Error en deleteEntry (cashflow):', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al eliminar la entrada' });
  }
};
