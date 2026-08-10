-- Язык интерфейса пользователя. Кука быстрее, но теряется вместе с браузером —
-- в базе он нужен, чтобы выбор пережил новое устройство.
ALTER TABLE "User" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'ru';

-- Язык оповещений. Не язык пользователя: сообщение уходит в чат, где сидят
-- разные люди, и «языка получателя» там не существует.
ALTER TABLE "AppSettings" ADD COLUMN "notifyLocale" TEXT NOT NULL DEFAULT 'ru';
