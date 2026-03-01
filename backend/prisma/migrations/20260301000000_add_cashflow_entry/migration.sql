-- CreateTable
CREATE TABLE "CashFlowEntry" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT,
    "projectId" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashFlowEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashFlowEntry_type_idx" ON "CashFlowEntry"("type");

-- CreateIndex
CREATE INDEX "CashFlowEntry_date_idx" ON "CashFlowEntry"("date");

-- CreateIndex
CREATE INDEX "CashFlowEntry_projectId_idx" ON "CashFlowEntry"("projectId");

-- CreateIndex
CREATE INDEX "CashFlowEntry_category_idx" ON "CashFlowEntry"("category");

-- AddForeignKey
ALTER TABLE "CashFlowEntry" ADD CONSTRAINT "CashFlowEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
