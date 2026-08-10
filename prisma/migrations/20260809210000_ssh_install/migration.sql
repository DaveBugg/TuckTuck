-- Адресные поля SSH для установки агента из панели.
-- Приватный ключ здесь не хранится намеренно: он приходит в запросе и живёт
-- только в памяти процесса на время установки.
ALTER TABLE "Resource" ADD COLUMN     "sshHost" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sshPort" INTEGER NOT NULL DEFAULT 22,
ADD COLUMN     "sshUser" TEXT NOT NULL DEFAULT 'root',
ADD COLUMN     "sshFingerprint" TEXT NOT NULL DEFAULT '';
