-- AlterTable
ALTER TABLE "NotifyBot" ADD COLUMN     "proxyUrlEnc" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "NotifySettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "proxyUrlEnc" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotifySettings_pkey" PRIMARY KEY ("id")
);

