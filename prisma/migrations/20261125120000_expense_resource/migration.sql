-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "resourceId" UUID;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

