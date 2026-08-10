import crypto from "crypto";

/**
 * Секрет вебхука бота.
 *
 * Выводится детерминированно из botId и ключа шифрования, а не хранится полем:
 * его нужно знать в двух местах (при setWebhook и при проверке входящего),
 * и лишняя колонка тут только повод для рассинхрона.
 *
 * Зачем вообще: URL вебхука неизбежно окажется в логах прокси и в истории
 * команд. Без секрета кто угодно, узнав его, слал бы нам «нажатия кнопок» —
 * то есть отмечал оплаты и удалял ресурсы.
 *
 * Telegram разрешает в secret_token только [A-Za-z0-9_-], до 256 символов.
 */
export function webhookSecret(botId: string): string {
  // Только ключ шифрования, без фолбэка на JWT: иначе ротация JWT-секрета
  // молча меняла бы секреты всех вебхуков, и кнопки переставали работать.
  const key = (process.env.TUCKTUCK_ENCRYPTION_KEY || "").trim();
  if (!key) throw new Error("TUCKTUCK_ENCRYPTION_KEY is not set");
  return crypto.createHmac("sha256", key).update(`webhook:${botId}`).digest("base64url");
}

/**
 * Публичный адрес панели для setWebhook. Телеграм ходит СЮДА, поэтому адрес
 * должен быть внешним и по HTTPS — localhost он не примет.
 */
export function publicBaseUrl(): string | null {
  const raw = process.env.TUCKTUCK_PUBLIC_URL || "";
  if (!raw) return null;
  const url = raw.replace(/\/+$/, "");
  return url.startsWith("https://") ? url : null;
}
