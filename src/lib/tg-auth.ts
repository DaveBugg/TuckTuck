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
  | { ok: true; user: TgInitDataUser }
  // reason — для серверных логов: иначе «не пускает из Telegram»
  // недиагностируемо. Наружу (в ответ клиенту) reason не уходит.
  | { ok: false; reason: string; user?: undefined };

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
    return { ok: false, reason: "empty" };
  }

  const params = new URLSearchParams(initData.replace(/^\?/, ""));
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "no_hash" };

  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDate)) return { ok: false, reason: "no_auth_date" };

  const now = Math.floor(Date.now() / 1000);
  if (authDate > now || now - authDate > maxAgeSec) {
    return { ok: false, reason: "stale" };
  }

  // data-check-string: пары key=value кроме hash, отсортированы по ключу,
  // через \n. Поле signature (Ed25519, Bot API 7.10+) ВКЛЮЧАЕТСЯ — проверено
  // на живом initData: Telegram подписывает строку с ним.
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  // secret_key = HMAC_SHA256(key="WebAppData", message=botToken).
  // Канонический порядок из документации (hmac.new(b"WebAppData", token)) —
  // не HMAC(key=token, msg="WebAppData"): перепутанный порядок даёт другой
  // ключ, и валидация молча не сходится никогда.
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  // Timing-safe сравнение. Длина обеих строк фиксирована (64 hex), поэтому
  // дополнительная проверка длины не утечёт полезной информации.
  const hashBuf = Buffer.from(hash, "hex");
  const expectedBuf = Buffer.from(
    crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex"),
    "hex"
  );
  if (
    hashBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(hashBuf, expectedBuf)
  ) {
    return { ok: false, reason: "bad_hash" };
  }

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false, reason: "no_user_field" };

  try {
    const user = JSON.parse(userRaw) as TgInitDataUser;
    if (!user || typeof user.id !== "number")
      return { ok: false, reason: "bad_user_field" };
    return { ok: true, user };
  } catch {
    return { ok: false, reason: "bad_user_json" };
  }
}
