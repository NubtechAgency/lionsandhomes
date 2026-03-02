// Mock Prisma before importing
vi.mock('../lib/prisma', () => ({
  default: {
    ocrUsage: {
      aggregate: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { checkBudget, recordUsage, getUsageSummary, getMonthlySpentCents, withOcrMutex } from './ocr-budget';
import prisma from '../lib/prisma';

const mockAggregate = vi.mocked(prisma.ocrUsage.aggregate);
const mockCount = vi.mocked(prisma.ocrUsage.count);
const mockCreate = vi.mocked(prisma.ocrUsage.create);

describe('OCR budget service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OCR_MONTHLY_BUDGET_CENTS;
  });

  describe('getMonthlySpentCents', () => {
    it('returns 0 when no usage this month', async () => {
      mockAggregate.mockResolvedValue({ _sum: { costCents: null } } as any);
      const spent = await getMonthlySpentCents();
      expect(spent).toBe(0);
    });

    it('returns sum of costCents for current month', async () => {
      mockAggregate.mockResolvedValue({ _sum: { costCents: 250 } } as any);
      const spent = await getMonthlySpentCents();
      expect(spent).toBe(250);
    });

    it('queries with start of current month', async () => {
      mockAggregate.mockResolvedValue({ _sum: { costCents: 0 } } as any);
      await getMonthlySpentCents();

      expect(mockAggregate).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: expect.any(Date),
          },
        },
        _sum: { costCents: true },
      });

      // Verify the date is start of month
      const call = mockAggregate.mock.calls[0][0] as any;
      const queryDate: Date = call.where.createdAt.gte;
      expect(queryDate.getDate()).toBe(1);
      expect(queryDate.getHours()).toBe(0);
    });
  });

  describe('checkBudget', () => {
    it('allows when spent is below default budget (1000 cents)', async () => {
      mockAggregate.mockResolvedValue({ _sum: { costCents: 500 } } as any);

      const status = await checkBudget();

      expect(status.allowed).toBe(true);
      expect(status.spentCents).toBe(500);
      expect(status.budgetCents).toBe(1000);
      expect(status.remainingCents).toBe(500);
    });

    it('denies when spent reaches budget', async () => {
      mockAggregate.mockResolvedValue({ _sum: { costCents: 1000 } } as any);

      const status = await checkBudget();

      expect(status.allowed).toBe(false);
      expect(status.remainingCents).toBe(0);
    });

    it('denies when spent exceeds budget', async () => {
      mockAggregate.mockResolvedValue({ _sum: { costCents: 1500 } } as any);

      const status = await checkBudget();

      expect(status.allowed).toBe(false);
      expect(status.remainingCents).toBe(0);
    });

    it('respects custom budget from env', async () => {
      process.env.OCR_MONTHLY_BUDGET_CENTS = '5000';
      mockAggregate.mockResolvedValue({ _sum: { costCents: 3000 } } as any);

      const status = await checkBudget();

      expect(status.allowed).toBe(true);
      expect(status.budgetCents).toBe(5000);
      expect(status.remainingCents).toBe(2000);
    });
  });

  describe('recordUsage', () => {
    it('creates OcrUsage record with correct data', async () => {
      mockCreate.mockResolvedValue({} as any);

      await recordUsage({
        invoiceId: 42,
        userId: 1,
        tokensInput: 5000,
        tokensOutput: 200,
        costCents: 3,
        model: 'claude-sonnet-4-20250514',
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          invoiceId: 42,
          userId: 1,
          tokensInput: 5000,
          tokensOutput: 200,
          costCents: 3,
          model: 'claude-sonnet-4-20250514',
        },
      });
    });

    it('handles null userId (automated/n8n calls)', async () => {
      mockCreate.mockResolvedValue({} as any);

      await recordUsage({
        invoiceId: 10,
        userId: null,
        tokensInput: 1000,
        tokensOutput: 100,
        costCents: 1,
        model: 'claude-sonnet-4-20250514',
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: null, // Prisma accepts null for optional relations
        }),
      });
    });
  });

  describe('getUsageSummary', () => {
    it('returns complete usage summary', async () => {
      mockAggregate.mockResolvedValue({ _sum: { costCents: 450 } } as any);
      mockCount.mockResolvedValue(10 as any);

      const summary = await getUsageSummary();

      expect(summary.spentCents).toBe(450);
      expect(summary.budgetCents).toBe(1000);
      expect(summary.remainingCents).toBe(550);
      expect(summary.callCount).toBe(10);
      expect(summary.avgCostCents).toBe(45);
      expect(summary.month).toMatch(/^\d{4}-\d{2}$/);
    });

    it('handles zero calls gracefully', async () => {
      mockAggregate.mockResolvedValue({ _sum: { costCents: null } } as any);
      mockCount.mockResolvedValue(0 as any);

      const summary = await getUsageSummary();

      expect(summary.spentCents).toBe(0);
      expect(summary.callCount).toBe(0);
      expect(summary.avgCostCents).toBe(0);
    });
  });

  describe('withOcrMutex', () => {
    it('serializes concurrent calls', async () => {
      const order: number[] = [];

      const task = (id: number, delay: number) => withOcrMutex(async () => {
        order.push(id);
        await new Promise(r => setTimeout(r, delay));
        order.push(id * 10);
        return id;
      });

      // Launch 3 tasks concurrently
      const [r1, r2, r3] = await Promise.all([
        task(1, 50),
        task(2, 30),
        task(3, 10),
      ]);

      expect(r1).toBe(1);
      expect(r2).toBe(2);
      expect(r3).toBe(3);

      // Tasks should run sequentially: each completes before the next starts
      // order should be [1, 10, 2, 20, 3, 30]
      expect(order).toEqual([1, 10, 2, 20, 3, 30]);
    });

    it('does not block on errors in previous call', async () => {
      // First call throws
      try {
        await withOcrMutex(async () => { throw new Error('fail'); });
      } catch { /* expected */ }

      // Second call should still work
      const result = await withOcrMutex(async () => 'ok');
      expect(result).toBe('ok');
    });
  });
});
