import test from "node:test";
import assert from "node:assert/strict";
import {
  serializeTelegramUserId,
  userWithTelegram,
} from "@/lib/user-serializer";

test("serializeTelegramUserId: BigInt → строка", () => {
  assert.equal(serializeTelegramUserId(BigInt("5195544786")), "5195544786");
});

test("serializeTelegramUserId: null/undefined → null", () => {
  assert.equal(serializeTelegramUserId(null), null);
  assert.equal(serializeTelegramUserId(undefined), null);
});

test("userWithTelegram: заменяет telegramUserId на строку", () => {
  const out = userWithTelegram({
    id: "u1",
    name: "Admin",
    telegramUserId: BigInt("42"),
  } as any);
  assert.equal(out.telegramUserId, "42");
  assert.equal(out.name, "Admin");
});

test("userWithTelegram: null telegramUserId остаётся null", () => {
  const out = userWithTelegram({
    id: "u2",
    telegramUserId: null,
  } as any);
  assert.equal(out.telegramUserId, null);
});

test("результат сериализуется в JSON без ошибок", () => {
  const out = userWithTelegram({
    id: "u1",
    telegramUserId: BigInt("5195544786"),
  } as any);
  assert.doesNotThrow(() => JSON.stringify(out));
  assert.equal(JSON.parse(JSON.stringify(out)).telegramUserId, "5195544786");
});
