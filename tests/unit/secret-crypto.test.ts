// Юнит-тесты шифрования секретов (AES-GCM at rest).
import test from "node:test";
import assert from "node:assert/strict";
// ключ должен быть в env ДО импорта модуля (он читает его при вызовах)
process.env.TUCKTUCK_ENCRYPTION_KEY =
  process.env.TUCKTUCK_ENCRYPTION_KEY || "unit-test-key-do-not-use-in-prod";
import { encryptSecret, decryptSecret } from "../../src/lib/secret-crypto";

test("roundtrip: encrypt → decrypt возвращает исходную строку", () => {
  for (const s of ["X-Api-Key: abc123", "простой секрет", "", "a".repeat(500)]) {
    const enc = encryptSecret(s);
    assert.equal(decryptSecret(enc), s);
  }
});

test("шифртекст имеет префикс enc:v1: и не содержит плейнтекст", () => {
  const enc = encryptSecret("my-plaintext-value");
  assert.ok(enc.startsWith("enc:v1:"));
  assert.ok(!enc.includes("my-plaintext-value"));
});

test("два шифрования одного значения различаются (случайный IV)", () => {
  assert.notEqual(encryptSecret("same"), encryptSecret("same"));
});

test("незашифрованное значение отвергается, а не возвращается как есть", () => {
  // Раньше строка без префикса молча отдавалась наружу как «легаси-плейнтекст».
  // Это опасно: подменённое в БД значение ушло бы в Telegram как токен бота.
  assert.throws(() => decryptSecret("просто строка"), /not encrypted|corrupted/);
  assert.throws(() => decryptSecret(""), /not encrypted|corrupted/);
  assert.throws(() => decryptSecret("enc:v1:мусор"), /corrupted/);
});

test("подмена шифротекста ловится тегом GCM", () => {
  const enc = encryptSecret("токен-бота");
  const parts = enc.split(":");
  parts[4] = Buffer.from("подделка").toString("base64url");
  assert.throws(() => decryptSecret(parts.join(":")));
});

test("пустой секрет — валидное значение и переживает roundtrip", () => {
  assert.equal(decryptSecret(encryptSecret("")), "");
});
test("порча тега/данных → decrypt бросает (GCM-аутентификация)", () => {
  const enc = encryptSecret("secret");
  const tampered = enc.slice(0, -4) + "AAAA";
  assert.throws(() => decryptSecret(tampered));
});
