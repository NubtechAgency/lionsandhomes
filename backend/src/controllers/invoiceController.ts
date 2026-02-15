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

    // Generar key y subir a R2
    const key = generateInvoiceKey(txId, file.originalname);
    await uploadFileToR2(key, file.buffer, file.mimetype);

    // Crear registro en tabla Invoice + actualizar hasInvoice
    await prisma.invoice.create({
      data: {
        transactionId: txId,
        url: key,
        fileName: file.originalname,
      },
    });

    const updatedTransaction = await prisma.transaction.update({
      where: { id: txId },
      data: { hasInvoice: true },
      include: {
        project: { select: { id: true, name: true } },
        invoices: true,
      },
    });

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

    // Borrar archivo de R2
    try {
      await deleteFile(invoice.url);
    } catch (r2Error) {
      console.error('Error al borrar archivo de R2 (continuando con limpieza de DB):', r2Error);
    }

    // Eliminar registro de Invoice
    await prisma.invoice.delete({
      where: { id: invoiceId },
    });

    // Verificar si quedan más facturas para esta transacción
    const remainingCount = await prisma.invoice.count({
      where: { transactionId: invoice.transactionId },
    });

    // Actualizar hasInvoice si era la última
    const updatedTransaction = await prisma.transaction.update({
      where: { id: invoice.transactionId },
      data: { hasInvoice: remainingCount > 0 },
      include: {
        project: { select: { id: true, name: true } },
        invoices: true,
      },
    });

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
