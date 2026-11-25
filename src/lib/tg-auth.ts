// Валидация Telegram WebApp initData.
//
// Документация: https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
// Алгоритм детерминирован и не требует запросов к Telegram — подпись проверяется
// локально по токену бота, который уже есть в панели.

import crypto from "crypto";

export type TgInitDataUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type ValidateInitDataResult =
  { ok: true; user: TgInitDataUser } | { ok: false; user?: undefined };

/**
 * Проверить подпись initData от Telegram WebApp.
 *
 * @param initData Строка query-string, пришедшая из window.Telegram.WebApp.initData.
 * @param botToken Токен бота (используется как ключ HMAC первого уровня).
 * @param maxAgeSec Максимальная свежесть auth_date (по умолчанию 24 часа).
 */
export function validateInitData(
  initData: unknown,
  botToken: string,
  maxAgeSec = 86400
): ValidateInitDataResult {
  if (typeof initData !== "string" || !initData || !botToken) {
    return { ok: false };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false };

  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDate)) return { ok: false };

  const now = Math.floor(Date.now() / 1000);
  if (authDate > now || now - authDate > maxAgeSec) {
    return { ok: false };
  }

  // data-check-string: пары key=value кроме hash и signature, отсортированы по
  // ключу, через \n. Telegram с Bot API 7.10+ добавляет поле signature, которое
  // тоже исключается из проверки (см. официальную документацию WebApp).
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash" || key === "signature") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  // secret_key = HMAC_SHA256(key=botToken, data="WebAppData")
  const secretKey = crypto
    .createHmac("sha256", botToken)
    .update("WebAppData")
    .digest();

  // expectedHash = HMAC_SHA256(key=secret_key, data=data-check-string), hex.
  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  // Timing-safe сравнение. Длина обеих строк фиксирована (64 hex), поэтому
  // дополнительная проверка длины не утечёт полезной информации.
  const hashBuf = Buffer.from(hash, "hex");
  const expectedBuf = Buffer.from(expectedHash, "hex");
  if (
    hashBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(hashBuf, expectedBuf)
  ) {
    return { ok: false };
  }

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false };

  try {
    const user = JSON.parse(userRaw) as TgInitDataUser;
    if (!user || typeof user.id !== "number") return { ok: false };
    return { ok: true, user };
  } catch {
    return { ok: false };
  }
}
