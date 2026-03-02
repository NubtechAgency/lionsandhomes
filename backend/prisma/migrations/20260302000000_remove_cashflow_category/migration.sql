-- DropIndex
DROP INDEX IF EXISTS "CashFlowEntry_category_idx";

-- AlterTable
ALTER TABLE "CashFlowEntry" DROP COLUMN "category";
