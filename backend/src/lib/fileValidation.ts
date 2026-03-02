// Validación de archivos — magic bytes y tipos MIME permitidos

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/**
 * Valida los magic bytes del archivo para verificar que el contenido real
 * coincide con el MIME type declarado (previene MIME spoofing).
 */
export function validateMagicBytes(buffer: Buffer, mimetype: string): boolean {
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
