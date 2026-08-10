// Какой прокси использовать для запросов в Telegram.
//
// Три уровня, от частного к общему:
//   1. прокси конкретного бота  — если у разных ботов разные каналы;
//   2. общий из настроек панели — обычный случай, настраивается в интерфейсе;
//   3. TELEGRAM_PROXY_URL из env — чтобы поднять систему до первого входа.
// Ни один не задан → идём напрямую.
//
// Адреса прокси хранятся зашифрованными: в них лежит пароль.

import { prisma } from "./prisma";
import { decryptSecret, encryptSecret } from "./secret-crypto";
import type { TFunc } from "./i18n/translate";

/** Расшифровать сохранённый адрес. Битое значение — как «не задан». */
function safeDecrypt(enc: string): string {
  if (!enc) return "";
  try {
    return decryptSecret(enc);
  } catch {
    // Значение могли зашифровать другим ключом (ротация) — в этом случае
    // честнее пойти напрямую, чем уронить отправку напоминаний.
    console.error("[notify-proxy] stored proxy url cannot be decrypted");
    return "";
  }
}

export async function globalProxyUrl(): Promise<string> {
  const s = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  return safeDecrypt(s?.proxyUrlEnc ?? "");
}

/** Итоговый адрес прокси для бота. Пустая строка = напрямую. */
export async function proxyForBot(botProxyEnc: string): Promise<string> {
  const own = safeDecrypt(botProxyEnc);
  if (own) return own;
  const shared = await globalProxyUrl();
  if (shared) return shared;
  return (process.env.TELEGRAM_PROXY_URL || "").trim();
}

/** Проверка адреса перед сохранением. Возвращает текст ошибки или null. */
export function validateProxyUrl(raw: string, t: TFunc): string | null {
  if (!raw) return null; // пусто — валидно, значит «напрямую»
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return t("proxy.err.notUrl");
  }
  const ok = ["socks5:", "socks4:", "socks:", "http:", "https:"];
  if (!ok.includes(url.protocol)) {
    return t("proxy.err.scheme", { scheme: url.protocol });
  }
  if (!url.hostname) return t("proxy.err.noHost");
  const port = Number(url.port);
  if (!url.port || !Number.isInteger(port) || port < 1 || port > 65535) {
    return t("proxy.err.port");
  }
  return null;
}

/** Адрес для показа: пароль скрыт. Наружу отдаём только это. */
export function maskProxyUrl(raw: string): string {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    // Адрес не разбирается как URL — показать его как есть нельзя: в нём
    // может быть пароль. Отдаём нейтральный маркер, а не текст: до языка
    // пользователя отсюда не дотянуться, и русское слово в английском
    // интерфейсе смотрелось бы ошибкой.
    return "***";
  }
}

export async function saveGlobalProxy(raw: string): Promise<void> {
  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", proxyUrlEnc: raw ? encryptSecret(raw) : "" },
    update: { proxyUrlEnc: raw ? encryptSecret(raw) : "" },
  });
}
