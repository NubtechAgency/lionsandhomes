// 📁 Servicio de Cloudflare R2 para almacenamiento de facturas
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Configuración del cliente S3 para Cloudflare R2
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'lions-invoices';

/**
 * Genera una URL firmada para subir un archivo a R2
 * @param key - Clave única del archivo en R2 (ej: invoices/1-1234567890-factura.pdf)
 * @param expiresIn - Tiempo de expiración en segundos (default: 600 = 10 minutos)
 * @returns URL firmada para PUT
 */
export async function generateUploadUrl(key: string, expiresIn: number = 600): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn });
  return uploadUrl;
}

/**
 * Genera una URL firmada para descargar un archivo desde R2
 * @param key - Clave del archivo en R2
 * @param expiresIn - Tiempo de expiración en segundos (default: 3600 = 1 hora)
 * @returns URL firmada para GET
 */
export async function generateDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const downloadUrl = await getSignedUrl(r2Client, command, { expiresIn });
  return downloadUrl;
}

/**
 * Elimina un archivo de R2
 * @param key - Clave del archivo en R2
 */
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await r2Client.send(command);
}

/**
 * Configura las reglas CORS del bucket R2 para permitir uploads directos desde el navegador
 */
export async function configureBucketCors(): Promise<void> {
  const command = new PutBucketCorsCommand({
    Bucket: BUCKET_NAME,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: ['*'],
          AllowedMethods: ['GET', 'PUT', 'HEAD'],
          AllowedHeaders: ['*'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  });

  await r2Client.send(command);
}

export function generateInvoiceKey(transactionId: number, fileName: string): string {
  const timestamp = Date.now();
  // Sanitizar el nombre del archivo (eliminar caracteres especiales)
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `invoices/${transactionId}-${timestamp}-${sanitizedFileName}`;
}
