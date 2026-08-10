// Шифрование секретов at rest (токены ботов, креды ресурсов): AES-256-GCM.
// Формат: enc:v1:<iv>:<tag>:<data>, всё в base64url.
import crypto from "crypto";

const PREFIX = "enc:v1:";

let cachedKey: Buffer | null = null;

/**
 * Ключ шифрования из TUCKTUCK_ENCRYPTION_KEY.
 *
 * Два режима, и это не косметика:
 *   64 hex-символа  → берём 32 байта как есть. Так и надо: `openssl rand -hex 32`.
 *   что-то другое   → считаем это парольной фразой и растягиваем scrypt'ом.
 *
 * Раньше здесь был просто sha256 от чего угодно. Для случайного ключа этого
 * достаточно, но фраза вида «myserver2024» превращалась в ключ за один хеш —
 * то есть дамп БД перебирался на GPU миллиардами вариантов в секунду. scrypt
 * с такими параметрами занимает десятки миллисекунд на попытку.
 *
 * Фолбэка на TUCKTUCK_JWT_SECRET больше нет намеренно: один секрет на две роли
 * означал, что ротация JWT молча делает нечитаемыми все сохранённые креды.
 *
 * Ключ считается один раз: scrypt дорогой, а вызывается это на каждом чтении.
 */
function key(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = (process.env.TUCKTUCK_ENCRYPTION_KEY || "").trim();
  if (!raw) {
    throw new Error(
      "TUCKTUCK_ENCRYPTION_KEY is not set. Generate one: openssl rand -hex 32"
    );
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    cachedKey = Buffer.from(raw, "hex");
  } else {
    // Соль фиксированная: она защищает от радужных таблиц, а от перебора
    // защищает стоимость scrypt. Хранить соль отдельно было бы негде — ключ
    // приходит из окружения, а не из БД.
    cachedKey = crypto.scryptSync(raw, "tucktuck:secret-crypto:v1", 32);
  }
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return (
    PREFIX +
    iv.toString("base64url") +
    ":" +
    cipher.getAuthTag().toString("base64url") +
    ":" +
    enc.toString("base64url")
  );
}

export function decryptSecret(stored: string): string {
  // Значение без префикса — не «легаси-плейнтекст», а повреждённая запись:
  // всё, что мы пишем, проходит через encryptSecret. Раньше здесь был молчаливый
  // возврат как есть, и подменённая в БД строка ушла бы в Telegram как токен.
  if (!stored.startsWith(PREFIX)) {
    throw new Error("secret is not encrypted or is corrupted");
  }
  const parts = stored.slice(PREFIX.length).split(":");
  // Ровно три части и непустые iv/tag. Проверять непустоту DATA нельзя:
  // шифротекст пустой строки сам пуст, и такая проверка ломала бы кейс,
  // который в тестах есть не случайно (пустой секрет — валидное значение).
  if (parts.length !== 3 || !parts[0] || !parts[1]) throw new Error("secret is corrupted");
  const [ivB, tagB, dataB] = parts;

  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
  // Тег проверяется в final(): при подмене шифротекста бросит исключение.
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
