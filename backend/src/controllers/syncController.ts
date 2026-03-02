// 🔄 Controlador de sincronización con n8n/Google Sheets
import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { logAudit, getClientIp } from '../services/auditLog';
import { flagDuplicatesForIds } from '../services/duplicateDetection';

/**
 * 📊 ESTRUCTURA DE DATOS QUE LLEGA DESDE N8N
 *
 * n8n enviará un objeto con este formato:
 * {
 *   "transactions": [
 *     {
 *       "externalId": "1784264579626750110--beb4407e088e8dad5b6b27d4719e1588",
 *       "date": "2026-02-06T00:00:00.000Z",
 *       "amount": -115,
 *       "concept": "COMPRA TARJ. 5540XXXXXXXX5013 LEROY MERLIN ES-RONCHIN",
 *       "category": "Uncategorized"
 *     },
 *     ...
 *   ]
 * }
 */

interface IncomingTransaction {
  externalId: string;
  date: string;
  amount: number;
  concept: string;
  category: string;
}

/**
 * POST /api/sync/transactions
 * Endpoint que recibe transacciones desde n8n y las sincroniza con la BD
 *
 * IMPORTANTE: Este endpoint NO sobrescribe las asignaciones manuales del usuario
 * (projectId, expenseCategory, notes, hasInvoice, invoiceUrl)
 */
export const syncTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    // Zod ya validó que transactions es un array con campos requeridos
    const { transactions } = req.body as { transactions: IncomingTransaction[] };

    // Estadísticas para el reporte final
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const createdIds: number[] = [];
    const errors: string[] = [];

    // 🔄 Procesar cada transacción
    for (const txn of transactions) {
      try {
        const result = await prisma.transaction.upsert({
          where: { externalId: txn.externalId },
          update: {
            date: new Date(txn.date),
            amount: txn.amount,
            concept: txn.concept,
            category: txn.category,
          },
          create: {
            externalId: txn.externalId,
            date: new Date(txn.date),
            amount: txn.amount,
            concept: txn.concept,
            category: txn.category,
            isManual: false,
          },
        });

        // If createdAt equals updatedAt (within 1 second), it was just created
        if (Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000) {
          created++;
          createdIds.push(result.id);
        } else {
          updated++;
        }
      } catch (error: any) {
        skipped++;
        errors.push(`Error en transacción ${txn.externalId}`);
        console.error('Error procesando transacción:', txn.externalId, error.message);
      }
    }

    // Detección de duplicados por contenido (fecha+importe+concepto)
    let flaggedForReview = 0;
    if (createdIds.length > 0) {
      try {
        flaggedForReview = await flagDuplicatesForIds(createdIds);
      } catch (error) {
        console.error('Error en detección de duplicados:', error);
      }
    }

    await logAudit({ action: 'SYNC', entityType: 'Transaction', details: { total: transactions.length, created, updated, skipped, flaggedForReview }, ipAddress: getClientIp(req) });

    // REPORTE FINAL
    res.status(200).json({
      message: 'Sincronización completada',
      stats: {
        total: transactions.length,
        created,
        updated,
        skipped,
        flaggedForReview,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Error en sincronización:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al sincronizar transacciones',
    });
  }
};

/**
 * GET /api/sync/status
 * Endpoint para verificar que el servicio de sincronización está funcionando
 */
export const getSyncStatus = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Obtener estadísticas rápidas de la BD
    const totalTransactions = await prisma.transaction.count();
    const syncedTransactions = await prisma.transaction.count({
      where: { isManual: false },
    });
    const manualTransactions = await prisma.transaction.count({
      where: { isManual: true },
    });

    res.status(200).json({
      status: 'OK',
      message: 'Servicio de sincronización funcionando correctamente',
      stats: {
        totalTransactions,
        syncedTransactions,
        manualTransactions,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error obteniendo estado de sincronización:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al obtener estado de sincronización',
    });
  }
};
