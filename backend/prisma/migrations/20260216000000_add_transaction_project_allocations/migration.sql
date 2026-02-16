-- CreateTable
CREATE TABLE "TransactionProject" (
    "id" SERIAL NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransactionProject_transactionId_idx" ON "TransactionProject"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionProject_projectId_idx" ON "TransactionProject"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionProject_transactionId_projectId_key" ON "TransactionProject"("transactionId", "projectId");

-- AddForeignKey
ALTER TABLE "TransactionProject" ADD CONSTRAINT "TransactionProject_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionProject" ADD CONSTRAINT "TransactionProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MigrateData: Copy existing projectId assignments to TransactionProject
INSERT INTO "TransactionProject" ("transactionId", "projectId", "amount", "createdAt")
SELECT "id", "projectId", "amount", NOW()
FROM "Transaction"
WHERE "projectId" IS NOT NULL;
