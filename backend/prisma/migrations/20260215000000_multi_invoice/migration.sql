-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- Migrate existing invoice data from Transaction to Invoice table
INSERT INTO "Invoice" ("transactionId", "url", "fileName", "createdAt")
SELECT "id", "invoiceUrl", "invoiceFileName", "updatedAt"
FROM "Transaction"
WHERE "invoiceUrl" IS NOT NULL AND "invoiceFileName" IS NOT NULL;

-- Drop old columns from Transaction
ALTER TABLE "Transaction" DROP COLUMN "invoiceUrl";
ALTER TABLE "Transaction" DROP COLUMN "invoiceFileName";

-- CreateIndex
CREATE INDEX "Invoice_transactionId_idx" ON "Invoice"("transactionId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
