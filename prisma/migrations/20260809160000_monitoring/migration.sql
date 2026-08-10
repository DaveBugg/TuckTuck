-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "agentToken" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "ResourceMetric" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "cpu" DOUBLE PRECISION,
    "memory" DOUBLE PRECISION,
    "disk" DOUBLE PRECISION,
    "load1" DOUBLE PRECISION,
    "uptimeSec" INTEGER,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResourceMetric_resourceId_createdAt_idx" ON "ResourceMetric"("resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "Resource_agentToken_idx" ON "Resource"("agentToken");

-- AddForeignKey
ALTER TABLE "ResourceMetric" ADD CONSTRAINT "ResourceMetric_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

