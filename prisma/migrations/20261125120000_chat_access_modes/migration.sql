-- AlterTable
ALTER TABLE "NotifyBotChat" ADD COLUMN     "allowedMode" TEXT NOT NULL DEFAULT 'users',
ADD COLUMN     "allowedProjectId" UUID;

-- Existing chats with an empty allow-list historically meant "everyone in chat".
UPDATE "NotifyBotChat" SET "allowedMode" = 'all' WHERE "allowedUserIds" = '{}';

-- CreateIndex
CREATE INDEX "NotifyBotChat_allowedProjectId_idx" ON "NotifyBotChat"("allowedProjectId");

-- AddForeignKey
ALTER TABLE "NotifyBotChat" ADD CONSTRAINT "NotifyBotChat_allowedProjectId_fkey" FOREIGN KEY ("allowedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
