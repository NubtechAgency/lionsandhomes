// 📄 Controller de gestión de facturas (Cloudflare R2)
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateUploadUrl, generateDownloadUrl, generateInvoiceKey, deleteFile } from '../services/cloudflare-r2';

const prisma = new PrismaClient();

/**
 * POST /api/invoices/upload-url
 * Genera una URL firmada para que el frontend suba un archivo directamente a R2
 */
export async function getUploadUrl(req: Request, res: Response) {
  try {
    const { transactionId, fileName } = req.body;

    // ✅ Validar parámetros
    if (!transactionId || !fileName) {
      return res.status(400).json({
        error: 'Parámetros faltantes',
        message: 'Se requiere transactionId y fileName',
      });
    }

    // 🔍 Verificar que la transacción existe
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Transacción no encontrada',
        message: 'No existe una transacción con ese ID',
      });
    }

    // 🔑 Generar clave única para el archivo
    const key = generateInvoiceKey(transactionId, fileName);

    // 📝 Generar URL firmada (válida por 10 minutos)
    const uploadUrl = await generateUploadUrl(key);

    res.json({
      uploadUrl,
      key,
      expiresIn: 600, // 10 minutos
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
export async function attachInvoice(req: Request, res: Response) {
  try {
    const transactionId = parseInt(req.params.id);
    const { key, fileName } = req.body;

    // ✅ Validar ID
    if (isNaN(transactionId)) {
      return res.status(400).json({
        error: 'ID inválido',
        message: 'El ID de la transacción debe ser un número',
      });
    }

    // ✅ Validar parámetros
    if (!key || !fileName) {
      return res.status(400).json({
        error: 'Parámetros faltantes',
        message: 'Se requiere key y fileName',
      });
    }

    // 🔍 Verificar que la transacción existe
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Transacción no encontrada',
        message: 'No existe una transacción con ese ID',
      });
    }

    // 💾 Actualizar transacción con la factura
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        hasInvoice: true,
        invoiceUrl: key, // Guardamos la key de R2
        invoiceFileName: fileName,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
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
export async function getInvoiceUrl(req: Request, res: Response) {
  try {
    const transactionId = parseInt(req.params.transactionId);

    // ✅ Validar ID
    if (isNaN(transactionId)) {
      return res.status(400).json({
        error: 'ID inválido',
        message: 'El ID de la transacción debe ser un número',
      });
    }

    // 🔍 Buscar transacción
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Transacción no encontrada',
        message: 'No existe una transacción con ese ID',
      });
    }

    // ✅ Verificar que tiene factura
    if (!transaction.hasInvoice || !transaction.invoiceUrl) {
      return res.status(404).json({
        error: 'Sin factura',
        message: 'Esta transacción no tiene una factura asociada',
      });
    }

    // 📝 Generar URL firmada de descarga (válida por 1 hora)
    const downloadUrl = await generateDownloadUrl(transaction.invoiceUrl);

    res.json({
      downloadUrl,
      fileName: transaction.invoiceFileName,
      expiresIn: 3600, // 1 hora
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
export async function deleteInvoice(req: Request, res: Response) {
  try {
    const transactionId = parseInt(req.params.id);

    if (isNaN(transactionId)) {
      return res.status(400).json({
        error: 'ID inválido',
        message: 'El ID de la transacción debe ser un número',
      });
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Transacción no encontrada',
        message: 'No existe una transacción con ese ID',
      });
    }

    if (!transaction.hasInvoice || !transaction.invoiceUrl) {
      return res.status(404).json({
        error: 'Sin factura',
        message: 'Esta transacción no tiene una factura asociada',
      });
    }

    // Borrar archivo de R2
    try {
      await deleteFile(transaction.invoiceUrl);
    } catch (r2Error) {
      console.error('Error al borrar archivo de R2 (continuando con limpieza de DB):', r2Error);
    }

    // Limpiar campos en la base de datos
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
