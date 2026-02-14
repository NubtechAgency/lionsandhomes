// 🔄 Controlador de sincronización con n8n/Google Sheets
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
    // 📥 Recibir array de transacciones desde n8n
    const { transactions } = req.body as { transactions: IncomingTransaction[] };

    // ✅ Validar que llegó un array
    if (!Array.isArray(transactions)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'El campo "transactions" debe ser un array',
      });
      return;
    }

    // 📊 Estadísticas para el reporte final
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // 🔄 Procesar cada transacción
    for (const txn of transactions) {
      try {
        // ✅ Validar campos obligatorios
        if (!txn.externalId || !txn.date || txn.amount === undefined || !txn.concept) {
          skipped++;
          errors.push(`Transacción con datos incompletos: ${JSON.stringify(txn)}`);
          continue;
        }

        // 🔍 Verificar si la transacción ya existe en la BD
        const existingTransaction = await prisma.transaction.findUnique({
          where: { externalId: txn.externalId },
        });

        if (existingTransaction) {
          // ✏️ YA EXISTE - Actualizar solo campos básicos (NO sobrescribir asignaciones manuales)
          await prisma.transaction.update({
            where: { externalId: txn.externalId },
            data: {
              // Solo actualizamos estos campos básicos
              date: new Date(txn.date),
              amount: txn.amount,
              concept: txn.concept,
              category: txn.category,
              // NO tocamos: projectId, expenseCategory, notes, hasInvoice, invoiceUrl, invoiceFileName
            },
          });
          updated++;
        } else {
          // ➕ NO EXISTE - Crear nueva transacción
          await prisma.transaction.create({
            data: {
              externalId: txn.externalId,
              date: new Date(txn.date),
              amount: txn.amount,
              concept: txn.concept,
              category: txn.category,
              isManual: false,  // Las transacciones sincronizadas NO son manuales
              // Los campos de asignación manual quedan NULL por defecto
            },
          });
          created++;
        }
      } catch (error: any) {
        // Si falla una transacción individual, no paramos todo el proceso
        skipped++;
        errors.push(`Error en transacción ${txn.externalId}: ${error.message}`);
        console.error('Error procesando transacción:', error);
      }
    }

    // 📊 REPORTE FINAL
    res.status(200).json({
      message: 'Sincronización completada',
      stats: {
        total: transactions.length,
        created,
        updated,
        skipped,
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
export const getSyncStatus = async (req: Request, res: Response): Promise<void> => {
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
