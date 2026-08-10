-- Язык по умолчанию — английский.
--
-- Меняется ТОЛЬКО значение по умолчанию для будущих строк. Уже заведённым
-- пользователям язык не переписываем: у них он либо выбран руками, либо
-- достался при заведении, и менять его за человека — не дело миграции.
ALTER TABLE "User" ALTER COLUMN "locale" SET DEFAULT 'en';
ALTER TABLE "AppSettings" ALTER COLUMN "notifyLocale" SET DEFAULT 'en';
