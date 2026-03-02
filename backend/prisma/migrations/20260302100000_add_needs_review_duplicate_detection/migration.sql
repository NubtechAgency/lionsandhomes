-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Transaction" ADD COLUMN "duplicateGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_needsReview_idx" ON "Transaction"("needsReview");
CREATE INDEX "Transaction_duplicateGroupId_idx" ON "Transaction"("duplicateGroupId");
