-- Telegram-оповещения: боты с фильтрами, чаты, журнал отправленных сообщений.
-- Только новые таблицы — существующие данные не затрагиваются.

-- CreateTable
CREATE TABLE "NotifyBot" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "kinds" "ResourceKind"[] DEFAULT ARRAY[]::"ResourceKind"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotifyBot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotifyBotChat" (
    "id" UUID NOT NULL,
    "botId" UUID NOT NULL,
    "chatId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotifyBotChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotifyBotTag" (
    "botId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "NotifyBotTag_pkey" PRIMARY KEY ("botId","tagId")
);

-- CreateTable
CREATE TABLE "NotifyMessage" (
    "id" UUID NOT NULL,
    "botId" UUID NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "resourceId" UUID,
    "dueDate" DATE,
    "actedAction" TEXT NOT NULL DEFAULT '',
    "actedAt" TIMESTAMP(3),
    "actedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotifyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotifyBotChat_botId_chatId_key" ON "NotifyBotChat"("botId", "chatId");

-- CreateIndex
CREATE INDEX "NotifyBotTag_tagId_idx" ON "NotifyBotTag"("tagId");

-- CreateIndex
CREATE INDEX "NotifyMessage_resourceId_idx" ON "NotifyMessage"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "NotifyMessage_chatId_messageId_key" ON "NotifyMessage"("chatId", "messageId");

-- AddForeignKey
ALTER TABLE "NotifyBotChat" ADD CONSTRAINT "NotifyBotChat_botId_fkey" FOREIGN KEY ("botId") REFERENCES "NotifyBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotifyBotTag" ADD CONSTRAINT "NotifyBotTag_botId_fkey" FOREIGN KEY ("botId") REFERENCES "NotifyBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotifyBotTag" ADD CONSTRAINT "NotifyBotTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotifyMessage" ADD CONSTRAINT "NotifyMessage_botId_fkey" FOREIGN KEY ("botId") REFERENCES "NotifyBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotifyMessage" ADD CONSTRAINT "NotifyMessage_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

