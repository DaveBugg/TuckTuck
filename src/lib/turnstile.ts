// Cloudflare Turnstile — серверная проверка токена.
//
// Ключи берутся из настроек в базе, а из окружения — только если в базе пусто.
// Порядок именно такой: тот, кто поставил панель готовым образом из GHCR, не
// может пересобрать бандл со своим ключом, и настройка в интерфейсе для него
// единственный способ включить капчу вообще.
//
// Fail-open, когда секрет не задан: капча не настроена — вход работает. Это
// осознанно, иначе свежая установка встречала бы человека неработающим входом.

import { prisma } from "./prisma";
import { decryptSecret } from "./secret-crypto";
import { getSettings } from "./settings";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Публичная половина. Уходит в браузер, поэтому берётся из общих настроек. */
export async function turnstileSiteKey(): Promise<string> {
  const s = await getSettings();
  return (
    s.turnstileSiteKey ||
    (process.env.TURNSTILE_SITE_KEY || "").trim() ||
    (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim()
  );
}

/**
 * Секретная половина. Наружу не отдаётся ни в каком виде.
 *
 * Читается прямым запросом, а не через getSettings: секрет не должен попадать
 * в кеш настроек, который целиком уезжает в Redis.
 */
export async function turnstileSecret(): Promise<string> {
  try {
    const row = await prisma.appSettings.findUnique({
      where: { id: "singleton" },
      select: { turnstileSecretEnc: true },
    });
    if (row?.turnstileSecretEnc) return decryptSecret(row.turnstileSecretEnc);
  } catch {
    // Ключ шифрования сменили или строка повреждена — падать на входе нельзя.
  }
  return (process.env.TURNSTILE_SECRET_KEY || "").trim();
}

export async function turnstileEnabled(): Promise<boolean> {
  return !!(await turnstileSecret());
}

/** true = проверка пройдена (или капча выключена). false = токен невалиден. */
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = await turnstileSecret();
  if (!secret) return true; // капча не настроена
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      // Без таймаута недоступный Cloudflare держал бы вход до таймаута fetch.
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({ success: false }));
    return !!data.success;
  } catch {
    // Cloudflare недоступен → пропускаем: их даунтайм не должен запирать панель.
    return true;
  }
}
