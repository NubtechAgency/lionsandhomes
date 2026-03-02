import { estimateCostCents, extractInvoiceData } from './ocr';

describe('OCR service', () => {
  describe('estimateCostCents', () => {
    it('returns 0 for zero tokens', () => {
      expect(estimateCostCents(0, 0)).toBe(0);
    });

    it('calculates cost correctly for typical usage', () => {
      // 1000 input tokens: (1000/1M) * 300 = 0.3 cents
      // 500 output tokens: (500/1M) * 1500 = 0.75 cents
      // Total: 1.05 → ceil = 2
      expect(estimateCostCents(1000, 500)).toBe(2);
    });

    it('calculates cost for large token counts', () => {
      // 100_000 input: (100000/1M) * 300 = 30 cents
      // 10_000 output: (10000/1M) * 1500 = 15 cents
      // Total: 45 → ceil = 45
      expect(estimateCostCents(100_000, 10_000)).toBe(45);
    });

    it('always rounds up (Math.ceil)', () => {
      // 1 input token: (1/1M) * 300 = 0.0003 cents
      // 1 output token: (1/1M) * 1500 = 0.0015 cents
      // Total: 0.0018 → ceil = 1
      expect(estimateCostCents(1, 1)).toBe(1);
    });

    it('output tokens cost 5x more than input', () => {
      // Same number of tokens — output should cost more
      const inputOnly = estimateCostCents(10_000, 0);
      const outputOnly = estimateCostCents(0, 10_000);
      expect(outputOnly).toBeGreaterThan(inputOnly);
      // 10k input: 3 cents, 10k output: 15 cents
      expect(inputOnly).toBe(3);
      expect(outputOnly).toBe(15);
    });
  });

  describe('extractInvoiceData', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it('parses valid JSON response from Claude', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: '{"amount": 150.50, "date": "2026-02-15", "vendor": "Leroy Merlin"}',
        }],
        usage: { input_tokens: 5000, output_tokens: 100 },
      };

      // Mock the Anthropic SDK
      vi.doMock('@anthropic-ai/sdk', () => ({
        default: class {
          messages = {
            create: vi.fn().mockResolvedValue(mockResponse),
          };
        },
      }));

      // Set API key
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const { extractInvoiceData: extract } = await import('./ocr');

      const pdfBuffer = Buffer.alloc(16);
      pdfBuffer.write('%PDF-1.7', 0, 'ascii');

      const result = await extract(pdfBuffer, 'application/pdf', 'test.pdf');

      expect(result.amount).toBe(150.50);
      expect(result.date).toBe('2026-02-15');
      expect(result.vendor).toBe('Leroy Merlin');
      expect(result.tokensInput).toBe(5000);
      expect(result.tokensOutput).toBe(100);
    });

    it('returns null fields when JSON cannot be parsed', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: 'Sorry, I cannot read this document.',
        }],
        usage: { input_tokens: 3000, output_tokens: 50 },
      };

      vi.doMock('@anthropic-ai/sdk', () => ({
        default: class {
          messages = {
            create: vi.fn().mockResolvedValue(mockResponse),
          };
        },
      }));

      process.env.ANTHROPIC_API_KEY = 'test-key';

      const { extractInvoiceData: extract } = await import('./ocr');

      const result = await extract(Buffer.alloc(16), 'image/jpeg', 'test.jpg');

      expect(result.amount).toBeNull();
      expect(result.date).toBeNull();
      expect(result.vendor).toBeNull();
      expect(result.tokensInput).toBe(3000);
      expect(result.tokensOutput).toBe(50);
      expect(result.rawResponse).toContain('Sorry');
    });

    it('validates date format strictly (YYYY-MM-DD)', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: '{"amount": 100, "date": "15/02/2026", "vendor": "Test"}',
        }],
        usage: { input_tokens: 1000, output_tokens: 50 },
      };

      vi.doMock('@anthropic-ai/sdk', () => ({
        default: class {
          messages = {
            create: vi.fn().mockResolvedValue(mockResponse),
          };
        },
      }));

      process.env.ANTHROPIC_API_KEY = 'test-key';

      const { extractInvoiceData: extract } = await import('./ocr');

      const result = await extract(Buffer.alloc(16), 'image/png', 'test.png');

      expect(result.amount).toBe(100);
      expect(result.date).toBeNull(); // Wrong format
      expect(result.vendor).toBe('Test');
    });

    it('rejects negative amounts', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: '{"amount": -50, "date": "2026-01-01", "vendor": "Test"}',
        }],
        usage: { input_tokens: 1000, output_tokens: 50 },
      };

      vi.doMock('@anthropic-ai/sdk', () => ({
        default: class {
          messages = {
            create: vi.fn().mockResolvedValue(mockResponse),
          };
        },
      }));

      process.env.ANTHROPIC_API_KEY = 'test-key';

      const { extractInvoiceData: extract } = await import('./ocr');

      const result = await extract(Buffer.alloc(16), 'image/png', 'test.png');

      expect(result.amount).toBeNull(); // Negative not allowed
    });

    it('truncates vendor to 500 characters', async () => {
      const longVendor = 'A'.repeat(1000);
      const mockResponse = {
        content: [{
          type: 'text',
          text: `{"amount": 10, "date": "2026-01-01", "vendor": "${longVendor}"}`,
        }],
        usage: { input_tokens: 1000, output_tokens: 50 },
      };

      vi.doMock('@anthropic-ai/sdk', () => ({
        default: class {
          messages = {
            create: vi.fn().mockResolvedValue(mockResponse),
          };
        },
      }));

      process.env.ANTHROPIC_API_KEY = 'test-key';

      const { extractInvoiceData: extract } = await import('./ocr');

      const result = await extract(Buffer.alloc(16), 'image/png', 'test.png');

      expect(result.vendor).toHaveLength(500);
    });

    it('handles JSON embedded in markdown code blocks', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: '```json\n{"amount": 75.00, "date": "2026-03-01", "vendor": "Ikea"}\n```',
        }],
        usage: { input_tokens: 1000, output_tokens: 50 },
      };

      vi.doMock('@anthropic-ai/sdk', () => ({
        default: class {
          messages = {
            create: vi.fn().mockResolvedValue(mockResponse),
          };
        },
      }));

      process.env.ANTHROPIC_API_KEY = 'test-key';

      const { extractInvoiceData: extract } = await import('./ocr');

      const result = await extract(Buffer.alloc(16), 'image/png', 'test.png');

      expect(result.amount).toBe(75);
      expect(result.date).toBe('2026-03-01');
      expect(result.vendor).toBe('Ikea');
    });
  });
});
