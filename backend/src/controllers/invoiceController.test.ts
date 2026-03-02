// ============================================================
// MOCKS — set up before importing the controller
// ============================================================
vi.mock('../lib/prisma', () => ({
  default: {
    invoice: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    transaction: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../services/cloudflare-r2', () => ({
  generateInvoiceKey: vi.fn((_txId: number, name: string) => `invoices/${name}`),
  generateOrphanInvoiceKey: vi.fn((name: string) => `orphans/${name}`),
  uploadFileToR2: vi.fn(),
  deleteFile: vi.fn(),
  getSignedDownloadUrl: vi.fn(),
}));

vi.mock('../services/ocr', () => ({
  extractInvoiceData: vi.fn(),
  estimateCostCents: vi.fn().mockReturnValue(5),
}));

vi.mock('../services/ocr-budget', () => ({
  withOcrMutex: vi.fn(async (fn: () => Promise<any>) => fn()),
  checkBudget: vi.fn().mockResolvedValue({ allowed: true, spentCents: 100, budgetCents: 1000, remainingCents: 900 }),
  recordUsage: vi.fn(),
  getUsageSummary: vi.fn(),
}));

vi.mock('../services/matching', () => ({
  findMatches: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/auditLog', () => ({
  logAudit: vi.fn(),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('../lib/fileValidation', () => ({
  validateMagicBytes: vi.fn().mockReturnValue(true),
  ALLOWED_MIME_TYPES: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
}));

import prisma from '../lib/prisma';
import { uploadFileToR2, deleteFile } from '../services/cloudflare-r2';
import { extractInvoiceData } from '../services/ocr';
import { checkBudget, withOcrMutex } from '../services/ocr-budget';
import { findMatches } from '../services/matching';
import { validateMagicBytes } from '../lib/fileValidation';
import { estimateCostCents } from '../services/ocr';
import { uploadInvoice, bulkUploadInvoices, linkInvoiceToTransaction } from './invoiceController';

// Helpers
function mockReq(overrides: any = {}) {
  return {
    file: overrides.file ?? {
      buffer: Buffer.alloc(16),
      originalname: 'factura.pdf',
      mimetype: 'application/pdf',
    },
    files: overrides.files,
    body: overrides.body ?? {},
    params: overrides.params ?? {},
    userId: overrides.userId ?? 1,
    ip: '127.0.0.1',
  } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('invoiceController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish factory defaults (vitest 4 clearAllMocks resets return values)
    vi.mocked(validateMagicBytes).mockReturnValue(true);
    vi.mocked(checkBudget).mockResolvedValue({ allowed: true, spentCents: 100, budgetCents: 1000, remainingCents: 900 });
    vi.mocked(withOcrMutex).mockImplementation(async (fn: any) => fn());
    vi.mocked(findMatches).mockResolvedValue([]);
    vi.mocked(estimateCostCents).mockReturnValue(5);
  });

  // ============================================================
  // SINGLE UPLOAD
  // ============================================================
  describe('uploadInvoice', () => {
    it('rejects request without file', async () => {
      const req = mockReq({ file: undefined });
      const res = mockRes();

      await uploadInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.any(String),
      }));
    });

    it('rejects invalid magic bytes', async () => {
      vi.mocked(validateMagicBytes).mockReturnValueOnce(false);
      const req = mockReq({ body: { transactionId: '1' } });
      const res = mockRes();

      await uploadInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects invalid transactionId', async () => {
      const req = mockReq({ body: { transactionId: 'abc' } });
      const res = mockRes();

      await uploadInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 if transaction does not exist', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(null);
      const req = mockReq({ body: { transactionId: '999' } });
      const res = mockRes();

      await uploadInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('uploads file to R2 and creates invoice atomically', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue({ id: 1 } as any);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        return fn({
          invoice: { create: vi.fn() },
          transaction: {
            update: vi.fn().mockResolvedValue({
              id: 1,
              hasInvoice: true,
              invoices: [{ id: 10, fileName: 'factura.pdf' }],
            }),
          },
        });
      });

      const req = mockReq({ body: { transactionId: '1' } });
      const res = mockRes();

      await uploadInvoice(req, res);

      expect(uploadFileToR2).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('exitosamente'),
      }));
    });

    it('cleans up R2 file if DB transaction fails', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue({ id: 1 } as any);
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('DB error'));

      const req = mockReq({ body: { transactionId: '1' } });
      const res = mockRes();

      await uploadInvoice(req, res);

      expect(deleteFile).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ============================================================
  // BULK UPLOAD + OCR + AUTO-ASSIGN
  // ============================================================
  describe('bulkUploadInvoices', () => {
    const mockFile = {
      buffer: Buffer.alloc(16),
      originalname: 'factura1.pdf',
      mimetype: 'application/pdf',
    };

    it('rejects request without files', async () => {
      const req = mockReq({ files: [] });
      const res = mockRes();

      await bulkUploadInvoices(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('skips files with invalid magic bytes', async () => {
      vi.mocked(validateMagicBytes).mockReturnValueOnce(false);
      vi.mocked(checkBudget).mockResolvedValue({ allowed: true, spentCents: 0, budgetCents: 1000, remainingCents: 1000 });

      const req = mockReq({ files: [mockFile] });
      const res = mockRes();

      await bulkUploadInvoices(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        results: [expect.objectContaining({ status: 'INVALID' })],
      }));
    });

    it('processes OCR and returns suggestions on success', async () => {
      const invoice = { id: 1, ocrStatus: 'COMPLETED', fileName: 'factura1.pdf' };
      vi.mocked(prisma.invoice.create).mockResolvedValue(invoice as any);
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoice as any);
      vi.mocked(extractInvoiceData).mockResolvedValue({
        amount: 150.50,
        date: '2026-02-15',
        vendor: 'Leroy Merlin',
        tokensInput: 5000,
        tokensOutput: 100,
        rawResponse: '{"amount":150.50}',
      });
      vi.mocked(findMatches).mockResolvedValue([
        {
          transactionId: 42,
          score: 95,
          scoreBreakdown: { amountScore: 40, dateScore: 25, conceptScore: 30 },
          transaction: {
            id: 42, date: '2026-02-15', amount: -150.50, concept: 'LEROY MERLIN',
            hasInvoice: false, projectId: null, expenseCategory: null, notes: null, project: null,
          },
        },
      ]);

      const req = mockReq({ files: [mockFile] });
      const res = mockRes();

      await bulkUploadInvoices(req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.results).toHaveLength(1);
      expect(response.results[0].status).toBe('COMPLETED');
      expect(response.results[0].suggestions).toHaveLength(1);
      expect(response.results[0].suggestions[0].score).toBe(95);
    });

    it('marks BUDGET_EXCEEDED when budget is exhausted', async () => {
      vi.mocked(checkBudget).mockResolvedValue({ allowed: false, spentCents: 1000, budgetCents: 1000, remainingCents: 0 });
      vi.mocked(prisma.invoice.create).mockResolvedValue({ id: 1, ocrStatus: 'PENDING' } as any);
      vi.mocked(prisma.invoice.update).mockResolvedValue({} as any);
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue({ id: 1, ocrStatus: 'BUDGET_EXCEEDED' } as any);

      const req = mockReq({ files: [mockFile] });
      const res = mockRes();

      await bulkUploadInvoices(req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.results[0].status).toBe('BUDGET_EXCEEDED');
    });

    it('handles OCR failure gracefully', async () => {
      vi.mocked(prisma.invoice.create).mockResolvedValue({ id: 1, ocrStatus: 'PENDING' } as any);
      vi.mocked(extractInvoiceData).mockRejectedValue(new Error('Claude API down'));
      vi.mocked(prisma.invoice.update).mockResolvedValue({} as any);
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue({ id: 1, ocrStatus: 'FAILED' } as any);

      const req = mockReq({ files: [mockFile] });
      const res = mockRes();

      await bulkUploadInvoices(req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.results[0].status).toBe('FAILED');
      expect(response.results[0].suggestions).toEqual([]);
    });

    it('processes multiple files independently', async () => {
      const files = [
        { ...mockFile, originalname: 'factura1.pdf' },
        { ...mockFile, originalname: 'factura2.pdf' },
      ];

      // First file: success, second file: invalid
      vi.mocked(validateMagicBytes)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      vi.mocked(prisma.invoice.create).mockResolvedValue({ id: 1, ocrStatus: 'PENDING' } as any);
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue({ id: 1, ocrStatus: 'COMPLETED' } as any);
      vi.mocked(extractInvoiceData).mockResolvedValue({
        amount: 50, date: null, vendor: null,
        tokensInput: 1000, tokensOutput: 50, rawResponse: '{}',
      });

      const req = mockReq({ files });
      const res = mockRes();

      await bulkUploadInvoices(req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.results).toHaveLength(2);
      expect(response.results[0].status).toBe('COMPLETED');
      expect(response.results[1].status).toBe('INVALID');
    });
  });

  // ============================================================
  // LINK INVOICE TO TRANSACTION (manual auto-assign)
  // ============================================================
  describe('linkInvoiceToTransaction', () => {
    it('returns 404 if invoice does not exist', async () => {
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null);

      const req = mockReq({ params: { invoiceId: '999' }, body: { transactionId: 1 } });
      const res = mockRes();

      await linkInvoiceToTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('rejects if invoice is already linked', async () => {
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
        id: 1,
        transactionId: 42, // Already linked
      } as any);

      const req = mockReq({ params: { invoiceId: '1' }, body: { transactionId: 99 } });
      const res = mockRes();

      await linkInvoiceToTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Ya vinculada',
      }));
    });

    it('returns 404 if target transaction does not exist', async () => {
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
        id: 1,
        transactionId: null, // Orphan
      } as any);
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(null);

      const req = mockReq({ params: { invoiceId: '1' }, body: { transactionId: 999 } });
      const res = mockRes();

      await linkInvoiceToTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('links invoice and sets hasInvoice=true atomically', async () => {
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
        id: 1,
        transactionId: null,
        fileName: 'factura.pdf',
      } as any);
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue({ id: 42 } as any);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        return fn({
          invoice: {
            update: vi.fn().mockResolvedValue({ id: 1, transactionId: 42 }),
          },
          transaction: {
            update: vi.fn().mockResolvedValue({ id: 42, hasInvoice: true }),
          },
        });
      });

      const req = mockReq({ params: { invoiceId: '1' }, body: { transactionId: 42 } });
      const res = mockRes();

      await linkInvoiceToTransaction(req, res);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('vinculada'),
      }));
    });
  });
});
