-- Server -> Resource: одна сущность на все оплачиваемые типы
-- (SERVER / VPN / PROXY / DOMAIN / SERVICE) вместо только серверов.
--
-- Таблицы пересоздаются, а не переименовываются: на момент миграции все
-- доменные таблицы ПУСТЫ (проверено), проект до релиза, и честный набор
-- CREATE/DROP читается яснее двух десятков ALTER ... RENAME. User и Session
-- не затрагиваются — на них только внешние ключи.

-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('SERVER', 'VPN', 'PROXY', 'DOMAIN', 'SERVICE');

-- DropForeignKey
ALTER TABLE "CredentialReveal" DROP CONSTRAINT "CredentialReveal_credentialId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentReminder" DROP CONSTRAINT "PaymentReminder_serverId_fkey";

-- DropForeignKey
ALTER TABLE "Server" DROP CONSTRAINT "Server_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Server" DROP CONSTRAINT "Server_groupId_fkey";

-- DropForeignKey
ALTER TABLE "Server" DROP CONSTRAINT "Server_providerId_fkey";

-- DropForeignKey
ALTER TABLE "ServerCredential" DROP CONSTRAINT "ServerCredential_serverId_fkey";

-- DropForeignKey
ALTER TABLE "ServerPayment" DROP CONSTRAINT "ServerPayment_recordedById_fkey";

-- DropForeignKey
ALTER TABLE "ServerPayment" DROP CONSTRAINT "ServerPayment_serverId_fkey";

-- DropForeignKey
ALTER TABLE "ServerTag" DROP CONSTRAINT "ServerTag_serverId_fkey";

-- DropForeignKey
ALTER TABLE "ServerTag" DROP CONSTRAINT "ServerTag_tagId_fkey";

-- DropIndex
DROP INDEX "PaymentReminder_serverId_daysBefore_key";

-- AlterTable
ALTER TABLE "PaymentReminder" DROP COLUMN "serverId",
ADD COLUMN     "resourceId" UUID NOT NULL;

-- DropTable
DROP TABLE "Server";

-- DropTable
DROP TABLE "ServerCredential";

-- DropTable
DROP TABLE "ServerPayment";

-- DropTable
DROP TABLE "ServerTag";

-- CreateTable
CREATE TABLE "ResourceTag" (
    "resourceId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "ResourceTag_pkey" PRIMARY KEY ("resourceId","tagId")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" UUID NOT NULL,
    "kind" "ResourceKind" NOT NULL DEFAULT 'SERVER',
    "name" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "port" INTEGER,
    "url" TEXT NOT NULL DEFAULT '',
    "domain" TEXT NOT NULL DEFAULT '',
    "meta" JSONB,
    "providerId" UUID,
    "groupId" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "periodValue" INTEGER NOT NULL DEFAULT 1,
    "periodUnit" "PeriodUnit" NOT NULL DEFAULT 'MONTH',
    "nextPaymentAt" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceCredential" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "username" TEXT NOT NULL DEFAULT '',
    "secretEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourcePayment" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paidAt" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourcePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResourceTag_tagId_idx" ON "ResourceTag"("tagId");

-- CreateIndex
CREATE INDEX "Resource_nextPaymentAt_idx" ON "Resource"("nextPaymentAt");

-- CreateIndex
CREATE INDEX "Resource_groupId_idx" ON "Resource"("groupId");

-- CreateIndex
CREATE INDEX "Resource_kind_idx" ON "Resource"("kind");

-- CreateIndex
CREATE INDEX "ResourceCredential_resourceId_idx" ON "ResourceCredential"("resourceId");

-- CreateIndex
CREATE INDEX "ResourcePayment_resourceId_paidAt_idx" ON "ResourcePayment"("resourceId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReminder_resourceId_daysBefore_key" ON "PaymentReminder"("resourceId", "daysBefore");

-- AddForeignKey
ALTER TABLE "ResourceTag" ADD CONSTRAINT "ResourceTag_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceTag" ADD CONSTRAINT "ResourceTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceCredential" ADD CONSTRAINT "ResourceCredential_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialReveal" ADD CONSTRAINT "CredentialReveal_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "ResourceCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourcePayment" ADD CONSTRAINT "ResourcePayment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourcePayment" ADD CONSTRAINT "ResourcePayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReminder" ADD CONSTRAINT "PaymentReminder_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

