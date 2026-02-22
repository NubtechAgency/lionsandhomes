// Controller de gestión de facturas (Cloudflare R2) - Multi-invoice + OCR bulk upload
import { Request, Response } from 'express';
import { Invoice } from '@prisma/client';
import prisma from '../lib/prisma';
import { generateDownloadUrl, generateInvoiceKey, generateOrphanInvoiceKey, deleteFile, uploadFileToR2 } from '../services/cloudflare-r2';
import { logAudit, getClientIp } from '../services/auditLog';
import { extractInvoiceData, estimateCostCents } from '../services/ocr';
import { withOcrMutex, checkBudget, recordUsage, getUsageSummary } from '../services/ocr-budget';
import { findMatches } from '../services/matching';

/**
 * Valida los magic bytes del archivo para verificar que el contenido real
 * coincide con el MIME type declarado (previene MIME spoofing).
 */
function validateMagicBytes(buffer: Buffer, mimetype: string): boolean {
  if (buffer.length < 12) return false;
  const hex = buffer.subarray(0, 4).toString('hex');

  switch (mimetype) {
    case 'application/pdf':
      return hex.startsWith('25504446'); // %PDF
    case 'image/jpeg':
      return hex.startsWith('ffd8ff');
    case 'image/png':
      return hex === '89504e47'; // ‰PNG
    case 'image/webp':
      // RIFF....WEBP
      return hex === '52494646' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    default:
      return false;
  }
}

/**
 * POST /api/invoices/upload
 * Sube una factura y la asocia a una transacción (permite múltiples por transacción)
 */
export async function uploadInvoice(req: Request, res: Response): Promise<void> {
  try {
    const file = req.file;
    const { transactionId } = req.body;

    if (!file || !transactionId) {
      res.status(400).json({
        error: 'Parámetros faltantes',
        message: 'Se requiere un archivo y transactionId',
      });
      return;
    }

    // Validación de tipo de archivo (defensa en profundidad — multer ya filtra)
    const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      res.status(400).json({
        error: 'Tipo de archivo no permitido',
        message: 'Solo se permiten archivos PDF, JPG, PNG y WebP',
      });
      return;
    }

    // Validar magic bytes: el contenido real del archivo debe coincidir con el MIME declarado
    if (!validateMagicBytes(file.buffer, file.mimetype)) {
      res.status(400).json({
        error: 'Archivo inválido',
        message: 'El contenido del archivo no coincide con el tipo declarado',
      });
      return;
    }

    const txId = parseInt(transactionId);
    if (isNaN(txId)) {
      res.status(400).json({
        error: 'ID inválido',
        message: 'El ID de la transacción debe ser un número',
      });
      return;
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: txId },
    });

    if (!transaction) {
      res.status(404).json({
        error: 'Transacción no encontrada',
        message: 'No existe una transacción con ese ID',
      });
      return;
    }

    // 1. Subir a R2 primero (sistema externo)
    const key = generateInvoiceKey(txId, file.originalname);
    await uploadFileToR2(key, file.buffer, file.mimetype);

    // 2. Operaciones de DB atómicas: crear Invoice + actualizar hasInvoice
    let updatedTransaction;
    try {
      updatedTransaction = await prisma.$transaction(async (tx) => {
        await tx.invoice.create({
          data: {
            transactionId: txId,
            url: key,
            fileName: file.originalname,
          },
        });

        return tx.transaction.update({
          where: { id: txId },
          data: { hasInvoice: true },
          include: {
            project: { select: { id: true, name: true } },
            invoices: true,
          },
        });
      });
    } catch (dbError) {
      // DB falló después de R2 → limpiar archivo huérfano de R2
      console.error('DB falló tras upload a R2, limpiando archivo:', key, dbError);
      try {
        await deleteFile(key);
      } catch (r2CleanupError) {
        console.error('No se pudo limpiar archivo huérfano en R2:', key, r2CleanupError);
      }
      throw dbError;
    }

    await logAudit({ action: 'UPLOAD', entityType: 'Invoice', entityId: txId, userId: req.userId, details: { fileName: file.originalname }, ipAddress: getClientIp(req) });

    res.json({
      message: 'Factura subida exitosamente',
      transaction: updatedTransaction,
    });
  } catch (error) {
    console.error('Error al subir factura:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al subir la factura',
    });
  }
}

/**
 * GET /api/invoices/:transactionId
 * Obtiene todas las facturas de una transacción con URLs de descarga firmadas
 */
export async function getInvoiceUrls(req: Request, res: Response): Promise<void> {
  try {
    const transactionId = parseInt(req.params.transactionId as string);

    if (isNaN(transactionId)) {
      res.status(400).json({
        error: 'ID inválido',
        message: 'El ID de la transacción debe ser un número',
      });
      return;
    }

    const invoices = await prisma.invoice.findMany({
      where: { transactionId },
      orderBy: { createdAt: 'asc' },
    });

    if (invoices.length === 0) {
      res.status(404).json({
        error: 'Sin facturas',
        message: 'Esta transacción no tiene facturas asociadas',
      });
      return;
    }

    // Generar URLs firmadas para cada factura
    const invoicesWithUrls = await Promise.all(
      invoices.map(async (inv) => ({
        id: inv.id,
        fileName: inv.fileName,
        downloadUrl: await generateDownloadUrl(inv.url),
        createdAt: inv.createdAt,
      }))
    );

    await logAudit({ action: 'DOWNLOAD', entityType: 'Invoice', entityId: transactionId, userId: req.userId, details: { count: invoices.length }, ipAddress: getClientIp(req) });

    res.json({
      invoices: invoicesWithUrls,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error('Error al obtener URLs de facturas:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al obtener las facturas',
    });
  }
}

/**
 * DELETE /api/invoices/:invoiceId
 * Elimina una factura individual (borra de R2 + registro en DB)
 * Si era la última, actualiza hasInvoice = false en la transacción
 */
export async function deleteInvoice(req: Request, res: Response): Promise<void> {
  try {
    const invoiceId = parseInt(req.params.invoiceId as string);

    if (isNaN(invoiceId)) {
      res.status(400).json({
        error: 'ID inválido',
        message: 'El ID de la factura debe ser un número',
      });
      return;
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      res.status(404).json({
        error: 'Factura no encontrada',
        message: 'No existe una factura con ese ID',
      });
      return;
    }

    // 1. DB atómico: eliminar Invoice + recalcular hasInvoice (si tiene transacción)
    let updatedTransaction = null;
    if (invoice.transactionId) {
      updatedTransaction = await prisma.$transaction(async (tx) => {
        await tx.invoice.delete({ where: { id: invoiceId } });

        const remainingCount = await tx.invoice.count({
          where: { transactionId: invoice.transactionId },
        });

        return tx.transaction.update({
          where: { id: invoice.transactionId! },
          data: { hasInvoice: remainingCount > 0 },
          include: {
            project: { select: { id: true, name: true } },
            invoices: true,
          },
        });
      });
    } else {
      // Factura huérfana: solo borrar el registro
      await prisma.invoice.delete({ where: { id: invoiceId } });
    }

    // 2. Borrar archivo de R2 (best-effort, después del commit de DB)
    try {
      await deleteFile(invoice.url);
    } catch (r2Error) {
      console.error('Archivo huérfano en R2 (DB ya limpia):', invoice.url, r2Error);
    }

    await logAudit({ action: 'DELETE', entityType: 'Invoice', entityId: invoiceId, userId: req.userId, details: { fileName: invoice.fileName, transactionId: invoice.transactionId }, ipAddress: getClientIp(req) });

    res.json({
      message: 'Factura eliminada exitosamente',
      transaction: updatedTransaction,
    });
  } catch (error) {
    console.error('Error al eliminar factura:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al eliminar la factura',
    });
  }
}

// ============================================================
// OCR BULK UPLOAD + ORPHAN MANAGEMENT
// ============================================================

/**
 * POST /api/invoices/bulk-upload
 * Sube hasta 10 facturas, almacena en R2, procesa OCR y busca matches.
 * El OCR se ejecuta bajo mutex para budget robusto.
 */
export async function bulkUploadInvoices(req: Request, res: Response): Promise<void> {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'Sin archivos', message: 'Debes subir al menos un archivo' });
      return;
    }

    const ocrModel = process.env.OCR_MODEL || 'claude-sonnet-4-20250514';
    const results: any[] = [];

    for (const file of files) {
      // 1. Validar magic bytes
      if (!validateMagicBytes(file.buffer, file.mimetype)) {
        results.push({
          fileName: file.originalname,
          status: 'INVALID',
          error: 'El contenido del archivo no coincide con el tipo declarado',
          invoice: null,
          suggestions: [],
        });
        continue;
      }

      // 2. Subir a R2 con key de huérfana
      const key = generateOrphanInvoiceKey(file.originalname);
      try {
        await uploadFileToR2(key, file.buffer, file.mimetype);
      } catch (r2Err) {
        results.push({
          fileName: file.originalname,
          status: 'FAILED',
          error: 'Error al subir archivo al almacenamiento',
          invoice: null,
          suggestions: [],
        });
        continue;
      }

      // 3. Crear Invoice con transactionId=null
      let invoice: Invoice;
      try {
        invoice = await prisma.invoice.create({
          data: {
            transactionId: null,
            url: key,
            fileName: file.originalname,
            ocrStatus: 'PENDING',
          },
        });
      } catch (dbErr) {
        // DB falló tras R2 upload → limpiar archivo huérfano
        try { await deleteFile(key); } catch { /* best-effort */ }
        results.push({
          fileName: file.originalname,
          status: 'FAILED',
          error: 'Error al guardar en base de datos',
          invoice: null,
          suggestions: [],
        });
        continue;
      }

      // 4. OCR bajo mutex (budget robusto)
      try {
        const ocrResult = await withOcrMutex(async () => {
          // Check budget dentro del mutex (atomico)
          const budget = await checkBudget();
          if (!budget.allowed) {
            // Budget excedido: marcar y saltar OCR
            await prisma.invoice.update({
              where: { id: invoice.id },
              data: { ocrStatus: 'BUDGET_EXCEEDED' },
            });
            return null; // Señal de budget excedido
          }

          // Llamar OCR
          const result = await extractInvoiceData(file.buffer, file.mimetype, file.originalname);
          const costCents = estimateCostCents(result.tokensInput, result.tokensOutput);

          // Actualizar invoice con datos OCR
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              ocrStatus: 'COMPLETED',
              ocrAmount: result.amount,
              ocrDate: result.date ? new Date(result.date) : null,
              ocrVendor: result.vendor,
              ocrInvoiceNumber: result.invoiceNumber,
              ocrRawResponse: result.rawResponse,
              ocrTokensUsed: result.tokensInput + result.tokensOutput,
              ocrCostCents: costCents,
            },
          });

          // Registrar uso
          await recordUsage({
            invoiceId: invoice.id,
            userId: req.userId!,
            tokensInput: result.tokensInput,
            tokensOutput: result.tokensOutput,
            costCents,
            model: ocrModel,
          });

          return result;
        });

        // Re-leer invoice actualizada
        invoice = (await prisma.invoice.findUnique({ where: { id: invoice.id } }))!;

        if (ocrResult === null) {
          // Budget excedido
          results.push({
            fileName: file.originalname,
            status: 'BUDGET_EXCEEDED',
            error: 'Presupuesto OCR mensual agotado',
            invoice,
            suggestions: [],
          });
        } else {
          // OCR exitoso: buscar matches
          const suggestions = await findMatches(
            ocrResult.amount,
            ocrResult.date ? new Date(ocrResult.date) : null,
            ocrResult.vendor
          );

          results.push({
            fileName: file.originalname,
            status: 'COMPLETED',
            invoice,
            suggestions,
          });
        }
      } catch (ocrErr: any) {
        // OCR falló: marcar con error
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            ocrStatus: 'FAILED',
            ocrError: ocrErr.message?.slice(0, 500) || 'Error desconocido en OCR',
          },
        });
        invoice = (await prisma.invoice.findUnique({ where: { id: invoice.id } }))!;

        results.push({
          fileName: file.originalname,
          status: 'FAILED',
          error: 'Error al procesar OCR',
          invoice,
          suggestions: [],
        });
      }

      await logAudit({
        action: 'BULK_UPLOAD',
        entityType: 'Invoice',
        entityId: invoice.id,
        userId: req.userId,
        details: { fileName: file.originalname, ocrStatus: invoice.ocrStatus },
        ipAddress: getClientIp(req),
      });
    }

    // Budget status actual para el frontend
    const budget = await checkBudget();

    res.json({ results, budget });
  } catch (error) {
    console.error('Error en bulk upload:', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al procesar la subida masiva' });
  }
}

/**
 * GET /api/invoices/orphans
 * Lista facturas huérfanas (sin transacción asignada).
 */
export async function listOrphanInvoices(req: Request, res: Response): Promise<void> {
  try {
    const { ocrStatus, search, limit: limitStr, offset: offsetStr } = req.query;
    const limit = Math.min(parseInt(limitStr as string) || 50, 100);
    const offset = parseInt(offsetStr as string) || 0;

    const where: any = { transactionId: null };

    if (ocrStatus) {
      where.ocrStatus = ocrStatus;
    }

    if (search && typeof search === 'string') {
      where.OR = [
        { fileName: { contains: search } },
        { ocrVendor: { contains: search } },
      ];
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.invoice.count({ where }),
    ]);

    // Generar URLs de descarga para cada factura
    const invoicesWithUrls = await Promise.all(
      invoices.map(async (inv) => ({
        id: inv.id,
        transactionId: inv.transactionId,
        fileName: inv.fileName,
        downloadUrl: await generateDownloadUrl(inv.url),
        ocrStatus: inv.ocrStatus,
        ocrAmount: inv.ocrAmount,
        ocrDate: inv.ocrDate,
        ocrVendor: inv.ocrVendor,
        ocrInvoiceNumber: inv.ocrInvoiceNumber,
        ocrError: inv.ocrError,
        ocrCostCents: inv.ocrCostCents,
        createdAt: inv.createdAt,
      }))
    );

    res.json({
      invoices: invoicesWithUrls,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Error al listar huérfanas:', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al listar facturas huérfanas' });
  }
}

/**
 * GET /api/invoices/:invoiceId/suggestions
 * Re-ejecuta matching para una factura huérfana específica.
 */
export async function getInvoiceSuggestions(req: Request, res: Response): Promise<void> {
  try {
    const invoiceId = parseInt(req.params.invoiceId as string);

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      res.status(404).json({ error: 'No encontrada', message: 'Factura no encontrada' });
      return;
    }

    if (invoice.transactionId !== null) {
      res.status(400).json({ error: 'Ya vinculada', message: 'Esta factura ya está vinculada a una transacción' });
      return;
    }

    const suggestions = await findMatches(
      invoice.ocrAmount,
      invoice.ocrDate,
      invoice.ocrVendor
    );

    res.json({ suggestions });
  } catch (error) {
    console.error('Error al obtener sugerencias:', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al obtener sugerencias' });
  }
}

/**
 * PATCH /api/invoices/:invoiceId/link
 * Vincula una factura huérfana a una transacción.
 */
export async function linkInvoiceToTransaction(req: Request, res: Response): Promise<void> {
  try {
    const invoiceId = parseInt(req.params.invoiceId as string);
    const { transactionId } = req.body;

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      res.status(404).json({ error: 'No encontrada', message: 'Factura no encontrada' });
      return;
    }

    if (invoice.transactionId !== null) {
      res.status(400).json({ error: 'Ya vinculada', message: 'Esta factura ya está vinculada a una transacción' });
      return;
    }

    const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!transaction) {
      res.status(404).json({ error: 'No encontrada', message: 'Transacción no encontrada' });
      return;
    }

    // Atómico: vincular factura + actualizar hasInvoice
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.update({
        where: { id: invoiceId },
        data: { transactionId },
      });

      await tx.transaction.update({
        where: { id: transactionId },
        data: { hasInvoice: true },
      });

      return inv;
    });

    await logAudit({
      action: 'LINK_INVOICE',
      entityType: 'Invoice',
      entityId: invoiceId,
      userId: req.userId,
      details: { transactionId, fileName: invoice.fileName },
      ipAddress: getClientIp(req),
    });

    res.json({ message: 'Factura vinculada exitosamente', invoice: updatedInvoice });
  } catch (error) {
    console.error('Error al vincular factura:', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al vincular la factura' });
  }
}

/**
 * PATCH /api/invoices/:invoiceId/ocr
 * Permite al usuario corregir los datos OCR extraídos.
 * Después de actualizar, re-ejecuta matching con los datos corregidos.
 */
export async function updateOcrData(req: Request, res: Response): Promise<void> {
  try {
    const invoiceId = parseInt(req.params.invoiceId as string);

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      res.status(404).json({ error: 'No encontrada', message: 'Factura no encontrada' });
      return;
    }

    if (invoice.transactionId !== null) {
      res.status(400).json({ error: 'Ya vinculada', message: 'No se pueden editar datos OCR de una factura ya vinculada' });
      return;
    }

    const { ocrAmount, ocrDate, ocrVendor, ocrInvoiceNumber } = req.body;

    const updateData: any = {};
    if (ocrAmount !== undefined) updateData.ocrAmount = ocrAmount;
    if (ocrDate !== undefined) updateData.ocrDate = new Date(ocrDate);
    if (ocrVendor !== undefined) updateData.ocrVendor = ocrVendor.slice(0, 500);
    if (ocrInvoiceNumber !== undefined) updateData.ocrInvoiceNumber = ocrInvoiceNumber.slice(0, 200);

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: updateData,
    });

    // Re-ejecutar matching con datos corregidos
    const suggestions = await findMatches(
      updatedInvoice.ocrAmount,
      updatedInvoice.ocrDate,
      updatedInvoice.ocrVendor
    );

    await logAudit({
      action: 'UPDATE_OCR',
      entityType: 'Invoice',
      entityId: invoiceId,
      userId: req.userId,
      details: { changes: Object.keys(updateData) },
      ipAddress: getClientIp(req),
    });

    res.json({ invoice: updatedInvoice, suggestions });
  } catch (error) {
    console.error('Error al actualizar datos OCR:', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al actualizar datos OCR' });
  }
}

/**
 * GET /api/invoices/ocr-budget
 * Devuelve el resumen de uso OCR del mes actual.
 */
export async function getOcrBudgetStatus(_req: Request, res: Response): Promise<void> {
  try {
    const summary = await getUsageSummary();
    res.json(summary);
  } catch (error) {
    console.error('Error al obtener budget OCR:', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al obtener estado del presupuesto OCR' });
  }
}
