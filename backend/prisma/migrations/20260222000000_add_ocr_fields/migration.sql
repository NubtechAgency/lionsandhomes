-- AlterTable: Make Invoice.transactionId nullable (for orphan invoices)
ALTER TABLE "Invoice" ALTER COLUMN "transactionId" DROP NOT NULL;

-- AlterTable: Drop old FK and re-add as nullable
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_transactionId_fkey";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Add OCR fields to Invoice
ALTER TABLE "Invoice" ADD COLUMN "ocrStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Invoice" ADD COLUMN "ocrAmount" DOUBLE PRECISION;
ALTER TABLE "Invoice" ADD COLUMN "ocrDate" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "ocrVendor" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "ocrInvoiceNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "ocrRawResponse" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "ocrError" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "ocrTokensUsed" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "ocrCostCents" INTEGER;

-- CreateIndex
CREATE INDEX "Invoice_ocrStatus_idx" ON "Invoice"("ocrStatus");

-- CreateTable: OcrUsage for budget tracking
CREATE TABLE "OcrUsage" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokensInput" INTEGER NOT NULL,
    "tokensOutput" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OcrUsage_createdAt_idx" ON "OcrUsage"("createdAt");
CREATE INDEX "OcrUsage_userId_idx" ON "OcrUsage"("userId");
