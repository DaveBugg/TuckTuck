-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramLinkCodeAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Expense_recurringId_date_key" ON "Expense"("recurringId", "date");

