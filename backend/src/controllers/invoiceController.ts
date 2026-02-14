// Controller de gestion de facturas (Cloudflare R2)
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateUploadUrl, generateDownloadUrl, generateInvoiceKey, deleteFile } from '../services/cloudflare-r2';

const prisma = new PrismaClient();

/**
 * POST /api/invoices/upload-url
 * Genera una URL firmada para que el frontend suba un archivo directamente a R2
 */
export async function getUploadUrl(req: Request, res: Response): Promise<void> {
  try {
    const { transactionId, fileName } = req.body;

    if (!transactionId || !fileName) {
      res.status(400).json({
        error: 'Parámetros faltantes',
        message: 'Se requiere transactionId y fileName',
      });
      return;
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      res.status(404).json({
        error: 'Transacción no encontrada',
        message: 'No existe una transacción con ese ID',
      });
      return;
    }

    const key = generateInvoiceKey(transactionId, fileName);
    const uploadUrl = await generateUploadUrl(key);

    res.json({
      uploadUrl,
      key,
      expiresIn: 600,
    });
  } catch (error) {
    console.error('Error al generar URL de upload:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al generar URL de subida',
    });
  }
}

/**
 * PATCH /api/transactions/:id/attach-invoice
 * Asocia una factura subida a R2 con una transacción
 */
export async function attachInvoice(req: Request, res: Response): Promise<void> {
  try {
    const transactionId = parseInt(req.params.id as string);
    const { key, fileName } = req.body;

    if (isNaN(transactionId)) {
      res.status(400).json({
        error: 'ID inválido',
        message: 'El ID de la transacción debe ser un número',
      });
      return;
    }

    if (!key || !fileName) {
      res.status(400).json({
        error: 'Parámetros faltantes',
        message: 'Se requiere key y fileName',
      });
      return;
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      res.status(404).json({
        error: 'Transacción no encontrada',
        message: 'No existe una transacción con ese ID',
      });
      return;
    }

    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        hasInvoice: true,
        invoiceUrl: key,
        invoiceFileName: fileName,
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
    });

    res.json({
      message: 'Factura asociada exitosamente',
      transaction: updatedTransaction,
    });
  } catch (error) {
    console.error('Error al asociar factura:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al asociar la factura',
    });
  }
}

/**
 * GET /api/invoices/:transactionId
 * Obtiene la URL de descarga de la factura de una transacción
 */
export async function getInvoiceUrl(req: Request, res: Response): Promise<void> {
  try {
    const transactionId = parseInt(req.params.transactionId as string);

    if (isNaN(transactionId)) {
      res.status(400).json({
        error: 'ID inválido',
        message: 'El ID de la transacción debe ser un número',
      });
      return;
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      res.status(404).json({
        error: 'Transacción no encontrada',
        message: 'No existe una transacción con ese ID',
      });
      return;
    }

    if (!transaction.hasInvoice || !transaction.invoiceUrl) {
      res.status(404).json({
        error: 'Sin factura',
        message: 'Esta transacción no tiene una factura asociada',
      });
      return;
    }

    const downloadUrl = await generateDownloadUrl(transaction.invoiceUrl);

    res.json({
      downloadUrl,
      fileName: transaction.invoiceFileName,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error('Error al obtener URL de factura:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al obtener la URL de la factura',
    });
  }
}

/**
 * DELETE /api/invoices/transactions/:id
 * Elimina la factura de una transacción (borra de R2 y limpia campos en DB)
 */
export async function deleteInvoice(req: Request, res: Response): Promise<void> {
  try {
    const transactionId = parseInt(req.params.id as string);

    if (isNaN(transactionId)) {
      res.status(400).json({
        error: 'ID inválido',
        message: 'El ID de la transacción debe ser un número',
      });
      return;
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      res.status(404).json({
        error: 'Transacción no encontrada',
        message: 'No existe una transacción con ese ID',
      });
      return;
    }

    if (!transaction.hasInvoice || !transaction.invoiceUrl) {
      res.status(404).json({
        error: 'Sin factura',
        message: 'Esta transacción no tiene una factura asociada',
      });
      return;
    }

    try {
      await deleteFile(transaction.invoiceUrl);
    } catch (r2Error) {
      console.error('Error al borrar archivo de R2 (continuando con limpieza de DB):', r2Error);
    }

    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        hasInvoice: false,
        invoiceUrl: null,
        invoiceFileName: null,
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
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
