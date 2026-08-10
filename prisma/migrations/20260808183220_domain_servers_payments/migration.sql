-- CreateEnum
CREATE TYPE "PeriodUnit" AS ENUM ('DAY', 'WEEK', 'MONTH', 'YEAR');

-- CreateTable
CREATE TABLE "Group" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerTag" (
    "serverId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "ServerTag_pkey" PRIMARY KEY ("serverId","tagId")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ip" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
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

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerCredential" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "username" TEXT NOT NULL DEFAULT '',
    "secretEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialReveal" (
    "id" UUID NOT NULL,
    "credentialId" UUID NOT NULL,
    "userId" UUID,
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "revealedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredentialReveal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerPayment" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paidAt" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReminder" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "daysBefore" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderDispatch" (
    "id" UUID NOT NULL,
    "reminderId" UUID NOT NULL,
    "dueDate" DATE NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ReminderDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

-- CreateIndex
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_name_key" ON "Provider"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "ServerTag_tagId_idx" ON "ServerTag"("tagId");

-- CreateIndex
CREATE INDEX "Server_nextPaymentAt_idx" ON "Server"("nextPaymentAt");

-- CreateIndex
CREATE INDEX "Server_groupId_idx" ON "Server"("groupId");

-- CreateIndex
CREATE INDEX "ServerCredential_serverId_idx" ON "ServerCredential"("serverId");

-- CreateIndex
CREATE INDEX "CredentialReveal_credentialId_revealedAt_idx" ON "CredentialReveal"("credentialId", "revealedAt");

-- CreateIndex
CREATE INDEX "CredentialReveal_userId_idx" ON "CredentialReveal"("userId");

-- CreateIndex
CREATE INDEX "ServerPayment_serverId_paidAt_idx" ON "ServerPayment"("serverId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReminder_serverId_daysBefore_key" ON "PaymentReminder"("serverId", "daysBefore");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderDispatch_reminderId_dueDate_key" ON "ReminderDispatch"("reminderId", "dueDate");

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerTag" ADD CONSTRAINT "ServerTag_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerTag" ADD CONSTRAINT "ServerTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerCredential" ADD CONSTRAINT "ServerCredential_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialReveal" ADD CONSTRAINT "CredentialReveal_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "ServerCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialReveal" ADD CONSTRAINT "CredentialReveal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerPayment" ADD CONSTRAINT "ServerPayment_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerPayment" ADD CONSTRAINT "ServerPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReminder" ADD CONSTRAINT "PaymentReminder_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderDispatch" ADD CONSTRAINT "ReminderDispatch_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "PaymentReminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
