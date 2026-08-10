-- AlterTable
ALTER TABLE "NotifyBotChat" ADD COLUMN     "allowedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

