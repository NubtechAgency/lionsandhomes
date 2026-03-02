import { validateMagicBytes, ALLOWED_MIME_TYPES } from './fileValidation';

describe('fileValidation', () => {
  describe('ALLOWED_MIME_TYPES', () => {
    it('includes PDF, JPEG, PNG, and WebP', () => {
      expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
      expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
      expect(ALLOWED_MIME_TYPES).toContain('image/png');
      expect(ALLOWED_MIME_TYPES).toContain('image/webp');
    });
  });

  describe('validateMagicBytes', () => {
    it('rejects buffers shorter than 12 bytes', () => {
      const tiny = Buffer.from([0x25, 0x50, 0x44]);
      expect(validateMagicBytes(tiny, 'application/pdf')).toBe(false);
    });

    // PDF: starts with %PDF (25504446)
    it('validates a real PDF header', () => {
      const pdfHeader = Buffer.alloc(16);
      pdfHeader.write('%PDF-1.7', 0, 'ascii');
      expect(validateMagicBytes(pdfHeader, 'application/pdf')).toBe(true);
    });

    it('rejects a JPEG file claimed as PDF', () => {
      const jpegHeader = Buffer.alloc(16);
      jpegHeader[0] = 0xff;
      jpegHeader[1] = 0xd8;
      jpegHeader[2] = 0xff;
      jpegHeader[3] = 0xe0;
      expect(validateMagicBytes(jpegHeader, 'application/pdf')).toBe(false);
    });

    // JPEG: starts with FFD8FF
    it('validates a real JPEG header', () => {
      const jpegHeader = Buffer.alloc(16);
      jpegHeader[0] = 0xff;
      jpegHeader[1] = 0xd8;
      jpegHeader[2] = 0xff;
      jpegHeader[3] = 0xe0;
      expect(validateMagicBytes(jpegHeader, 'image/jpeg')).toBe(true);
    });

    it('rejects a PNG file claimed as JPEG', () => {
      const pngHeader = Buffer.alloc(16);
      pngHeader[0] = 0x89;
      pngHeader[1] = 0x50;
      pngHeader[2] = 0x4e;
      pngHeader[3] = 0x47;
      expect(validateMagicBytes(pngHeader, 'image/jpeg')).toBe(false);
    });

    // PNG: starts with 89504E47
    it('validates a real PNG header', () => {
      const pngHeader = Buffer.alloc(16);
      pngHeader[0] = 0x89;
      pngHeader[1] = 0x50;
      pngHeader[2] = 0x4e;
      pngHeader[3] = 0x47;
      expect(validateMagicBytes(pngHeader, 'image/png')).toBe(true);
    });

    // WebP: RIFF....WEBP
    it('validates a real WebP header', () => {
      const webpHeader = Buffer.alloc(16);
      webpHeader.write('RIFF', 0, 'ascii');
      // bytes 4-7: file size (any value)
      webpHeader.write('WEBP', 8, 'ascii');
      expect(validateMagicBytes(webpHeader, 'image/webp')).toBe(true);
    });

    it('rejects RIFF without WEBP at bytes 8-12', () => {
      const aviHeader = Buffer.alloc(16);
      aviHeader.write('RIFF', 0, 'ascii');
      aviHeader.write('AVI ', 8, 'ascii');
      expect(validateMagicBytes(aviHeader, 'image/webp')).toBe(false);
    });

    // Unknown MIME type
    it('rejects unknown MIME types', () => {
      const buf = Buffer.alloc(16);
      expect(validateMagicBytes(buf, 'text/plain')).toBe(false);
      expect(validateMagicBytes(buf, 'application/json')).toBe(false);
    });

    // Cross-type spoofing
    it('rejects PDF bytes claimed as PNG', () => {
      const pdfHeader = Buffer.alloc(16);
      pdfHeader.write('%PDF-1.7', 0, 'ascii');
      expect(validateMagicBytes(pdfHeader, 'image/png')).toBe(false);
    });
  });
});
