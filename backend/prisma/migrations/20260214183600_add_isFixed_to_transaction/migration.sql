-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "isFixed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Transaction_isFixed_idx" ON "Transaction"("isFixed");
