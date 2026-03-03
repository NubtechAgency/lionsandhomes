// Controlador de sincronización con n8n/Google Sheets + Telegram upload
import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { Invoice } from '@prisma/client';
import { logAudit, getClientIp } from '../services/auditLog';
import { flagDuplicatesForIds } from '../services/duplicateDetection';
import { generateOrphanInvoiceKey, uploadFileToR2, deleteFile } from '../services/cloudflare-r2';
import { findMatches } from '../services/matching';
import { validateMagicBytes } from '../lib/fileValidation';
import { AUTO_ASSIGN_THRESHOLD } from '../lib/constants';

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
  projectId?: number | null;
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
            // ⚠️ NO tocar projectId en update — preserva asignación manual del usuario
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
            projectId: txn.projectId ?? null,
            // Si n8n envía projectId, crear también el registro de asignación
            ...(txn.projectId != null && {
              allocations: {
                create: { projectId: txn.projectId, amount: txn.amount },
              },
            }),
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

/**
 * POST /api/sync/invoice
 * Recibe una factura desde n8n (Telegram bot).
 * n8n ya ejecuta OCR con Claude Sonnet y envía los datos extraídos (amount, date, vendor, invoiceNumber)
 * junto con el archivo binario via multipart/form-data.
 * Flujo: validar → R2 → guardar datos OCR de n8n → matching → auto-assign si score >= 95 o dejar huérfana.
 */
export const telegramUploadInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Sin archivo', message: 'Se requiere un archivo' });
      return;
    }

    // Validar magic bytes
    if (!validateMagicBytes(file.buffer, file.mimetype)) {
      res.status(400).json({
        error: 'Archivo inválido',
        message: 'El contenido del archivo no coincide con el tipo declarado',
      });
      return;
    }

    // Parsear datos OCR enviados por n8n (multipart → todo es string)
    const amount = req.body.amount ? parseFloat(req.body.amount) : null;
    const date = req.body.date || null;
    const vendor = req.body.vendor || null;

    // 1. Subir a R2 como huérfana
    const key = generateOrphanInvoiceKey(file.originalname);
    await uploadFileToR2(key, file.buffer, file.mimetype);

    // 2. Crear Invoice con datos OCR de n8n (source=telegram, ocrStatus=COMPLETED)
    let invoice: Invoice;
    try {
      invoice = await prisma.invoice.create({
        data: {
          transactionId: null,
          url: key,
          fileName: file.originalname,
          ocrStatus: 'COMPLETED',
          source: 'telegram',
          ocrAmount: amount,
          ocrDate: date ? new Date(date) : null,
          ocrVendor: vendor,
        },
      });
    } catch (dbErr) {
      try { await deleteFile(key); } catch { /* best-effort cleanup */ }
      throw dbErr;
    }

    // 3. Matching + auto-assign
    let suggestions: Awaited<ReturnType<typeof findMatches>> = [];
    let autoAssigned = false;
    let linkedTransactionId: number | null = null;

    if (amount !== null) {
      suggestions = await findMatches(
        amount,
        date ? new Date(date) : null,
        vendor
      );

      // Auto-assign si top match >= threshold
      if (suggestions.length > 0 && suggestions[0].score >= AUTO_ASSIGN_THRESHOLD) {
        const bestMatch = suggestions[0];
        try {
          await prisma.$transaction(async (tx) => {
            await tx.invoice.update({
              where: { id: invoice.id },
              data: { transactionId: bestMatch.transactionId },
            });
            await tx.transaction.update({
              where: { id: bestMatch.transactionId },
              data: { hasInvoice: true },
            });
          });

          autoAssigned = true;
          linkedTransactionId = bestMatch.transactionId;
        } catch (linkErr) {
          console.error('Auto-assign falló, dejando como huérfana:', linkErr);
        }
      }
    }

    // Re-leer invoice con estado final
    const finalInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    if (!finalInvoice) {
      res.status(500).json({ error: 'Error del servidor', message: 'No se pudo recuperar la factura creada' });
      return;
    }

    // 4. Audit log
    await logAudit({
      action: 'TELEGRAM_UPLOAD',
      entityType: 'Invoice',
      entityId: finalInvoice.id,
      details: {
        fileName: file.originalname,
        autoAssigned,
        linkedTransactionId,
        matchScore: suggestions[0]?.score ?? null,
      },
      ipAddress: getClientIp(req),
    });

    // 5. Respuesta para n8n
    res.status(200).json({
      message: autoAssigned
        ? 'Factura subida y vinculada automáticamente'
        : 'Factura subida como huérfana para revisión manual',
      invoice: finalInvoice,
      autoAssigned,
      linkedTransactionId,
      suggestions: suggestions.slice(0, 3),
    });
  } catch (error) {
    console.error('Error en telegram upload:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al procesar la factura de Telegram',
    });
  }
};
