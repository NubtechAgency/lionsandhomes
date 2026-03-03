-- Add Invoice.source column (was in schema but migration was never created)
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'web';

-- CreateIndex for Invoice.source
CREATE INDEX IF NOT EXISTS "Invoice_source_idx" ON "Invoice"("source");

-- Fix OcrUsage.userId: make nullable (schema says Int? but DB has NOT NULL)
ALTER TABLE "OcrUsage" ALTER COLUMN "userId" DROP NOT NULL;
