// Ограничение частоты попыток входа.
//
// Redis в тестах нет, и это ровно тот режим, который проверять важнее всего:
// счётчик в памяти процесса — единственная защита, когда кеш недоступен.

import test from "node:test";
import assert from "node:assert/strict";
import { rateLimit, rateLimitReset, ipKey, idKey } from "../../src/lib/rate-limit";

test("лимит срабатывает после исчерпания и говорит, сколько ждать", async () => {
  const key = "test:burst";
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) {
    const v = await rateLimit(key, 3, 60, now);
    assert.ok(v.ok, `попытка ${i + 1} должна пройти`);
  }
  const blocked = await rateLimit(key, 3, 60, now);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 60);
});

test("окно фиксированное: после его конца счёт начинается заново", async () => {
  const key = "test:window";
  const now = 2_000_000;
  await rateLimit(key, 1, 60, now);
  assert.equal((await rateLimit(key, 1, 60, now)).ok, false);
  // Ровно на границе окно уже закрылось.
  assert.equal((await rateLimit(key, 1, 60, now + 60_000)).ok, true);
});

test("сброс после успешного входа возвращает полный лимит", async () => {
  const key = "test:reset";
  const now = 3_000_000;
  await rateLimit(key, 2, 60, now);
  await rateLimit(key, 2, 60, now);
  assert.equal((await rateLimit(key, 2, 60, now)).ok, false);
  await rateLimitReset(key);
  assert.equal((await rateLimit(key, 2, 60, now)).ok, true);
});

test("ключи разводят адреса и логины", () => {
  assert.notEqual(ipKey("login", "1.2.3.4"), ipKey("login", "1.2.3.5"));
  // Регистр почты не должен давать второй счётчик — иначе лимит обходится
  // сменой заглавных букв.
  assert.equal(idKey("login", "Admin@Local"), idKey("login", "admin@local"));
  // Пустой адрес не должен превращаться в отдельный ключ на каждую попытку.
  assert.equal(ipKey("login", ""), ipKey("login", ""));
  // Длинный мусор в ключе — это память Redis, потраченная на того, кто её тратит.
  assert.ok(idKey("login", "x".repeat(500)).length < 200);
});

test("счётчики разных ключей независимы", async () => {
  const now = 4_000_000;
  await rateLimit("test:a", 1, 60, now);
  assert.equal((await rateLimit("test:a", 1, 60, now)).ok, false);
  assert.equal((await rateLimit("test:b", 1, 60, now)).ok, true);
});
