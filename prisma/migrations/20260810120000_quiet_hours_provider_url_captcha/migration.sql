-- Ссылка на сайт провайдера: оплата почти всегда начинается с перехода туда.
ALTER TABLE "Provider" ADD COLUMN "url" TEXT NOT NULL DEFAULT '';

-- Окно тишины. Равные значения = без ограничения, поэтому 0/0 по умолчанию
-- сохраняет прежнее поведение: слать круглосуточно.
ALTER TABLE "AppSettings" ADD COLUMN "notifyFromHour" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AppSettings" ADD COLUMN "notifyToHour" INTEGER NOT NULL DEFAULT 0;

-- Ключи капчи в базе: с готовым образом из GHCR задать их иначе нельзя.
ALTER TABLE "AppSettings" ADD COLUMN "turnstileSiteKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppSettings" ADD COLUMN "turnstileSecretEnc" TEXT NOT NULL DEFAULT '';

-- У бота своё окно; NULL = как у всей установки.
ALTER TABLE "NotifyBot" ADD COLUMN "notifyFromHour" INTEGER;
ALTER TABLE "NotifyBot" ADD COLUMN "notifyToHour" INTEGER;
