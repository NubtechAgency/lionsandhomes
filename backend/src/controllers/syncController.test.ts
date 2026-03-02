// ============================================================
// MOCKS
// ============================================================
vi.mock('../lib/prisma', () => ({
  default: {
    invoice: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      upsert: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../services/cloudflare-r2', () => ({
  generateOrphanInvoiceKey: vi.fn((name: string) => `orphans/${name}`),
  uploadFileToR2: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock('../services/ocr', () => ({
  extractInvoiceData: vi.fn(),
  estimateCostCents: vi.fn().mockReturnValue(5),
}));

vi.mock('../services/ocr-budget', () => ({
  withOcrMutex: vi.fn(async (fn: () => Promise<any>) => fn()),
  checkBudget: vi.fn().mockResolvedValue({ allowed: true, spentCents: 100, budgetCents: 1000, remainingCents: 900 }),
  recordUsage: vi.fn(),
}));

vi.mock('../services/matching', () => ({
  findMatches: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/duplicateDetection', () => ({
  flagDuplicatesForIds: vi.fn().mockResolvedValue(0),
}));

vi.mock('../services/auditLog', () => ({
  logAudit: vi.fn(),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('../lib/fileValidation', () => ({
  validateMagicBytes: vi.fn().mockReturnValue(true),
}));

vi.mock('../lib/constants', () => ({
  AUTO_ASSIGN_THRESHOLD: 95,
}));

import prisma from '../lib/prisma';
import { uploadFileToR2, deleteFile } from '../services/cloudflare-r2';
import { extractInvoiceData } from '../services/ocr';
import { checkBudget, recordUsage, withOcrMutex } from '../services/ocr-budget';
import { findMatches } from '../services/matching';
import { validateMagicBytes } from '../lib/fileValidation';
import { estimateCostCents } from '../services/ocr';
import { telegramUploadInvoice } from './syncController';

function mockReq(overrides: any = {}) {
  return {
    file: 'file' in overrides ? overrides.file : {
      buffer: Buffer.alloc(16),
      originalname: 'telegram-factura.pdf',
      mimetype: 'application/pdf',
    },
    body: overrides.body ?? {},
    ip: '127.0.0.1',
  } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('syncController — telegramUploadInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish factory defaults (vitest 4 clearAllMocks resets return values)
    vi.mocked(validateMagicBytes).mockReturnValue(true);
    vi.mocked(checkBudget).mockResolvedValue({ allowed: true, spentCents: 100, budgetCents: 1000, remainingCents: 900 });
    vi.mocked(withOcrMutex).mockImplementation(async (fn: any) => fn());
    vi.mocked(findMatches).mockResolvedValue([]);
    vi.mocked(estimateCostCents).mockReturnValue(5);
  });

  it('rejects request without file', async () => {
    const req = mockReq({ file: undefined });
    const res = mockRes();

    await telegramUploadInvoice(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects file with invalid magic bytes', async () => {
    vi.mocked(validateMagicBytes).mockReturnValueOnce(false);

    const req = mockReq();
    const res = mockRes();

    await telegramUploadInvoice(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Archivo inválido',
    }));
  });

  it('uploads to R2 and creates orphan invoice', async () => {
    const invoice = { id: 1, ocrStatus: 'COMPLETED', transactionId: null };
    vi.mocked(prisma.invoice.create).mockResolvedValue(invoice as any);
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoice as any);
    vi.mocked(extractInvoiceData).mockResolvedValue({
      amount: 75.50,
      date: '2026-03-01',
      vendor: 'Ikea',
      tokensInput: 3000,
      tokensOutput: 80,
      rawResponse: '{"amount":75.50}',
    });

    const req = mockReq();
    const res = mockRes();

    await telegramUploadInvoice(req, res);

    expect(uploadFileToR2).toHaveBeenCalled();
    expect(prisma.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        transactionId: null,
        ocrStatus: 'PENDING',
        source: 'telegram',
      }),
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('auto-assigns when match score >= threshold (95)', async () => {
    const invoice = { id: 1, ocrStatus: 'COMPLETED', transactionId: null };
    vi.mocked(prisma.invoice.create).mockResolvedValue(invoice as any);
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoice as any);
    vi.mocked(extractInvoiceData).mockResolvedValue({
      amount: 100,
      date: '2026-02-15',
      vendor: 'Leroy Merlin',
      tokensInput: 5000,
      tokensOutput: 100,
      rawResponse: '{}',
    });
    vi.mocked(findMatches).mockResolvedValue([
      {
        transactionId: 42,
        score: 98, // Above threshold
        scoreBreakdown: { amountScore: 40, dateScore: 28, conceptScore: 30 },
        transaction: {
          id: 42, date: '2026-02-15', amount: -100, concept: 'LEROY MERLIN',
          hasInvoice: false, projectId: null, expenseCategory: null, notes: null, project: null,
        },
      },
    ]);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      return fn({
        invoice: { update: vi.fn().mockResolvedValue({ id: 1, transactionId: 42 }) },
        transaction: { update: vi.fn().mockResolvedValue({ id: 42, hasInvoice: true }) },
      });
    });

    const req = mockReq();
    const res = mockRes();

    await telegramUploadInvoice(req, res);

    expect(prisma.$transaction).toHaveBeenCalled();
    const response = res.json.mock.calls[0][0];
    expect(response.autoAssigned).toBe(true);
    expect(response.linkedTransactionId).toBe(42);
  });

  it('does NOT auto-assign when score < threshold', async () => {
    const invoice = { id: 1, ocrStatus: 'COMPLETED', transactionId: null };
    vi.mocked(prisma.invoice.create).mockResolvedValue(invoice as any);
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoice as any);
    vi.mocked(extractInvoiceData).mockResolvedValue({
      amount: 100,
      date: '2026-02-15',
      vendor: 'Tienda Desconocida',
      tokensInput: 5000,
      tokensOutput: 100,
      rawResponse: '{}',
    });
    vi.mocked(findMatches).mockResolvedValue([
      {
        transactionId: 42,
        score: 60, // Below threshold
        scoreBreakdown: { amountScore: 40, dateScore: 20, conceptScore: 0 },
        transaction: {
          id: 42, date: '2026-02-15', amount: -100, concept: 'LEROY MERLIN',
          hasInvoice: false, projectId: null, expenseCategory: null, notes: null, project: null,
        },
      },
    ]);

    const req = mockReq();
    const res = mockRes();

    await telegramUploadInvoice(req, res);

    expect(prisma.$transaction).not.toHaveBeenCalled(); // No auto-assign
    const response = res.json.mock.calls[0][0];
    expect(response.autoAssigned).toBe(false);
    expect(response.linkedTransactionId).toBeNull();
  });

  it('handles budget exceeded gracefully', async () => {
    const invoice = { id: 1, ocrStatus: 'BUDGET_EXCEEDED', transactionId: null };
    vi.mocked(prisma.invoice.create).mockResolvedValue({ id: 1, ocrStatus: 'PENDING' } as any);
    vi.mocked(checkBudget).mockResolvedValue({ allowed: false, spentCents: 1000, budgetCents: 1000, remainingCents: 0 });
    vi.mocked(prisma.invoice.update).mockResolvedValue({} as any);
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoice as any);

    const req = mockReq();
    const res = mockRes();

    await telegramUploadInvoice(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.message).toContain('presupuesto');
    expect(response.autoAssigned).toBe(false);
  });

  it('handles OCR failure without crashing', async () => {
    vi.mocked(prisma.invoice.create).mockResolvedValue({ id: 1, ocrStatus: 'PENDING' } as any);
    vi.mocked(extractInvoiceData).mockRejectedValue(new Error('API timeout'));
    vi.mocked(prisma.invoice.update).mockResolvedValue({} as any);
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({ id: 1, ocrStatus: 'FAILED' } as any);

    const req = mockReq();
    const res = mockRes();

    await telegramUploadInvoice(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.autoAssigned).toBe(false);
  });

  it('cleans up R2 file if DB create fails', async () => {
    vi.mocked(prisma.invoice.create).mockRejectedValue(new Error('DB error'));

    const req = mockReq();
    const res = mockRes();

    await telegramUploadInvoice(req, res);

    expect(deleteFile).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('records OCR usage after successful extraction', async () => {
    const invoice = { id: 1, ocrStatus: 'COMPLETED', transactionId: null };
    vi.mocked(prisma.invoice.create).mockResolvedValue(invoice as any);
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoice as any);
    vi.mocked(extractInvoiceData).mockResolvedValue({
      amount: 50,
      date: null,
      vendor: null,
      tokensInput: 2000,
      tokensOutput: 60,
      rawResponse: '{}',
    });

    const req = mockReq();
    const res = mockRes();

    await telegramUploadInvoice(req, res);

    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({
      invoiceId: 1,
      userId: null, // Telegram = automated
      tokensInput: 2000,
      tokensOutput: 60,
    }));
  });

  it('passes ocrHints from request body', async () => {
    const invoice = { id: 1, ocrStatus: 'COMPLETED', transactionId: null };
    vi.mocked(prisma.invoice.create).mockResolvedValue(invoice as any);
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoice as any);
    vi.mocked(extractInvoiceData).mockResolvedValue({
      amount: 100, date: null, vendor: null,
      tokensInput: 1000, tokensOutput: 50, rawResponse: '{}',
    });

    const req = mockReq({ body: { ocrHints: 'Esta es una factura de material' } });
    const res = mockRes();

    await telegramUploadInvoice(req, res);

    expect(extractInvoiceData).toHaveBeenCalledWith(
      expect.any(Buffer),
      'application/pdf',
      'telegram-factura.pdf',
      'Esta es una factura de material',
    );
  });
});
