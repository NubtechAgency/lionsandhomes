-- DropColumn: Remove ocrInvoiceNumber from Invoice (field no longer used by OCR)
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "ocrInvoiceNumber";
