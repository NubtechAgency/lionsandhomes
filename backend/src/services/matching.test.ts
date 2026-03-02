// Mock Prisma before importing matching
vi.mock('../lib/prisma', () => ({
  default: {
    transaction: {
      findMany: vi.fn(),
    },
  },
}));

import { findMatches } from './matching';
import prisma from '../lib/prisma';

const mockFindMany = vi.mocked(prisma.transaction.findMany);

// Helper to create a mock transaction
function mockTx(overrides: Partial<{
  id: number; date: Date; amount: number; concept: string;
  hasInvoice: boolean; projectId: number | null;
  expenseCategory: string | null; notes: string | null;
  project: { id: number; name: string } | null;
}> = {}) {
  return {
    id: overrides.id ?? 1,
    date: overrides.date ?? new Date('2026-02-15'),
    amount: overrides.amount ?? -100,
    concept: overrides.concept ?? 'COMPRA LEROY MERLIN',
    hasInvoice: overrides.hasInvoice ?? false,
    projectId: overrides.projectId ?? null,
    expenseCategory: overrides.expenseCategory ?? null,
    notes: overrides.notes ?? null,
    project: overrides.project ?? null,
  };
}

describe('matching service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findMatches', () => {
    it('returns empty when no amount and no date', async () => {
      const result = await findMatches(null, null, null);
      expect(result).toEqual([]);
      expect(mockFindMany).not.toHaveBeenCalled();
    });

    it('returns empty when no candidates found', async () => {
      mockFindMany.mockResolvedValue([]);
      const result = await findMatches(100, new Date('2026-02-15'), 'Test');
      expect(result).toEqual([]);
    });

    it('scores exact amount match highly (40 points)', async () => {
      mockFindMany.mockResolvedValue([
        mockTx({ id: 1, amount: -100, date: new Date('2026-01-01'), concept: 'ALGO DIFERENTE' }),
      ]);

      const result = await findMatches(100, null, null);

      expect(result).toHaveLength(1);
      expect(result[0].scoreBreakdown.amountScore).toBe(40);
      expect(result[0].scoreBreakdown.dateScore).toBe(0); // no ocrDate
      expect(result[0].scoreBreakdown.conceptScore).toBe(0); // no vendor
    });

    it('gives lower score for amount with 10% difference', async () => {
      mockFindMany.mockResolvedValue([
        mockTx({ id: 1, amount: -110 }), // 10% difference from 100
      ]);

      const result = await findMatches(100, null, null);

      expect(result).toHaveLength(1);
      expect(result[0].scoreBreakdown.amountScore).toBe(28); // ±10% = 28 pts
    });

    it('gives 0 score for amount with >50% difference', async () => {
      mockFindMany.mockResolvedValue([
        mockTx({ id: 1, amount: -200 }), // 100% diff from 100
      ]);

      const result = await findMatches(100, null, null);

      // Score would be 0 for amount → total < 20 → filtered out
      expect(result).toHaveLength(0);
    });

    it('scores exact date match highly (30 points)', async () => {
      const date = new Date('2026-02-15');
      mockFindMany.mockResolvedValue([
        mockTx({ id: 1, amount: -100, date }),
      ]);

      const result = await findMatches(100, date, null);

      expect(result).toHaveLength(1);
      expect(result[0].scoreBreakdown.dateScore).toBe(30);
    });

    it('gives lower date score for ±3 days', async () => {
      mockFindMany.mockResolvedValue([
        mockTx({ id: 1, amount: -100, date: new Date('2026-02-18') }), // 3 days later
      ]);

      const result = await findMatches(100, new Date('2026-02-15'), null);

      expect(result).toHaveLength(1);
      expect(result[0].scoreBreakdown.dateScore).toBe(20); // ±3 days = 20 pts
    });

    it('scores concept substring match highly (30 points)', async () => {
      mockFindMany.mockResolvedValue([
        mockTx({ id: 1, amount: -100, concept: 'COMPRA TARJ LEROY MERLIN MADRID' }),
      ]);

      const result = await findMatches(100, null, 'Leroy Merlin');

      expect(result).toHaveLength(1);
      expect(result[0].scoreBreakdown.conceptScore).toBe(30); // substring match
    });

    it('scores partial word overlap with Jaccard', async () => {
      mockFindMany.mockResolvedValue([
        mockTx({ id: 1, amount: -100, concept: 'COMPRA MATERIAL CONSTRUCCION' }),
      ]);

      const result = await findMatches(100, null, 'Material obra construccion reforma');

      expect(result).toHaveLength(1);
      // 'material' and 'construccion' overlap, other words don't
      const conceptScore = result[0].scoreBreakdown.conceptScore;
      expect(conceptScore).toBeGreaterThan(0);
      expect(conceptScore).toBeLessThan(30); // Not full match
    });

    it('filters out scores below 20', async () => {
      mockFindMany.mockResolvedValue([
        mockTx({ id: 1, amount: -150, concept: 'ALGO MUY DIFERENTE' }), // Low score
      ]);

      const result = await findMatches(100, null, 'Nada que ver');

      // Amount 50% off → 8 pts, concept no match → 0 → total 8 < 20 → filtered
      expect(result).toHaveLength(0);
    });

    it('returns results sorted by score descending', async () => {
      mockFindMany.mockResolvedValue([
        mockTx({ id: 1, amount: -110, date: new Date('2026-02-20'), concept: 'RANDOM SHOP' }),
        mockTx({ id: 2, amount: -100, date: new Date('2026-02-15'), concept: 'LEROY MERLIN RONCHIN' }),
        mockTx({ id: 3, amount: -100, date: new Date('2026-02-15'), concept: 'OTRO GASTO DISTINTO' }),
      ]);

      const result = await findMatches(100, new Date('2026-02-15'), 'Leroy Merlin');

      // id=2 should be first (exact amount + date + concept match)
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].transactionId).toBe(2);

      // Scores should be descending
      for (let i = 1; i < result.length; i++) {
        expect(result[i].score).toBeLessThanOrEqual(result[i - 1].score);
      }
    });

    it('limits results to specified count', async () => {
      const txns = Array.from({ length: 10 }, (_, i) =>
        mockTx({ id: i + 1, amount: -100, date: new Date('2026-02-15') })
      );
      mockFindMany.mockResolvedValue(txns);

      const result = await findMatches(100, new Date('2026-02-15'), null, 3);

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('works with only date (no amount)', async () => {
      const date = new Date('2026-02-15');
      mockFindMany.mockResolvedValue([
        mockTx({ id: 1, amount: -500, date }),
      ]);

      const result = await findMatches(null, date, null);

      expect(result).toHaveLength(1);
      expect(result[0].scoreBreakdown.amountScore).toBe(0);
      expect(result[0].scoreBreakdown.dateScore).toBe(30);
    });

    it('handles concept normalization (diacritics, case)', async () => {
      mockFindMany.mockResolvedValue([
        mockTx({ id: 1, amount: -100, concept: 'COMPRA DECORACIÓN MÁLAGA' }),
      ]);

      const result = await findMatches(100, null, 'decoracion malaga');

      expect(result).toHaveLength(1);
      expect(result[0].scoreBreakdown.conceptScore).toBeGreaterThan(0);
    });

    it('includes transaction details in results', async () => {
      const date = new Date('2026-02-15');
      mockFindMany.mockResolvedValue([
        mockTx({
          id: 42,
          amount: -100,
          date,
          concept: 'LEROY MERLIN',
          hasInvoice: false,
          projectId: 5,
          expenseCategory: 'MATERIAL_Y_MANO_DE_OBRA',
          notes: 'Compra de material',
          project: { id: 5, name: 'Reforma Piso 1' },
        }),
      ]);

      const result = await findMatches(100, date, 'Leroy Merlin');

      expect(result[0].transactionId).toBe(42);
      expect(result[0].transaction.id).toBe(42);
      expect(result[0].transaction.amount).toBe(-100);
      expect(result[0].transaction.hasInvoice).toBe(false);
      expect(result[0].transaction.project?.name).toBe('Reforma Piso 1');
    });

    it('handles perfect match (100 points)', async () => {
      const date = new Date('2026-02-15');
      mockFindMany.mockResolvedValue([
        mockTx({ id: 1, amount: -100, date, concept: 'LEROY MERLIN' }),
      ]);

      const result = await findMatches(100, date, 'Leroy Merlin');

      expect(result).toHaveLength(1);
      expect(result[0].score).toBe(100);
      expect(result[0].scoreBreakdown.amountScore).toBe(40);
      expect(result[0].scoreBreakdown.dateScore).toBe(30);
      expect(result[0].scoreBreakdown.conceptScore).toBe(30);
    });
  });
});
