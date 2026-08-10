-- DropTable
-- (перенос данных ниже, до удаления старой таблицы)

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "proxyUrlEnc" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "metricsRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "displayCurrency" TEXT NOT NULL DEFAULT 'USD',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- Переносим сохранённый прокси из прежней таблицы настроек и только потом её
-- удаляем: пользователь мог задать его в панели, и молча потерять адрес с
-- паролем — значит сломать оповещения без единого сообщения.
INSERT INTO "AppSettings" ("id", "proxyUrlEnc", "updatedAt")
SELECT 'singleton', "proxyUrlEnc", NOW() FROM "NotifySettings" WHERE "id" = 'singleton'
ON CONFLICT ("id") DO UPDATE SET "proxyUrlEnc" = EXCLUDED."proxyUrlEnc";

DROP TABLE "NotifySettings";


-- CreateTable
CREATE TABLE "ResourceMetricRollup" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "cpu" DOUBLE PRECISION,
    "memory" DOUBLE PRECISION,
    "disk" DOUBLE PRECISION,
    "load1" DOUBLE PRECISION,
    "samples" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ResourceMetricRollup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResourceMetricRollup_resourceId_bucket_startsAt_idx" ON "ResourceMetricRollup"("resourceId", "bucket", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceMetricRollup_resourceId_bucket_startsAt_key" ON "ResourceMetricRollup"("resourceId", "bucket", "startsAt");

-- AddForeignKey
ALTER TABLE "ResourceMetricRollup" ADD CONSTRAINT "ResourceMetricRollup_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

