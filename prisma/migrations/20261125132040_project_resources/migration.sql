-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "projectId" UUID;

-- AlterTable
ALTER TABLE "ProjectMember" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

