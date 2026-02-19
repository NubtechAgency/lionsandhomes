// Controller de gestión de facturas (Cloudflare R2) - Multi-invoice
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateDownloadUrl, generateInvoiceKey, deleteFile, uploadFileToR2 } from '../services/cloudflare-r2';

const prisma = new PrismaClient();

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

    // 1. DB atómico: eliminar Invoice + recalcular hasInvoice
    const updatedTransaction = await prisma.$transaction(async (tx) => {
      await tx.invoice.delete({ where: { id: invoiceId } });

      const remainingCount = await tx.invoice.count({
        where: { transactionId: invoice.transactionId },
      });

      return tx.transaction.update({
        where: { id: invoice.transactionId },
        data: { hasInvoice: remainingCount > 0 },
        include: {
          project: { select: { id: true, name: true } },
          invoices: true,
        },
      });
    });

    // 2. Borrar archivo de R2 (best-effort, después del commit de DB)
    try {
      await deleteFile(invoice.url);
    } catch (r2Error) {
      console.error('Archivo huérfano en R2 (DB ya limpia):', invoice.url, r2Error);
    }

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
