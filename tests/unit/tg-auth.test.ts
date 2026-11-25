import assert from "node:assert";
import { describe, it } from "node:test";
import crypto from "crypto";
import { validateInitData } from "@/lib/tg-auth";

const BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

function buildInitData(
  user: { id: number; first_name: string },
  authDate: number
): string {
  const pairs = [`auth_date=${authDate}`, `user=${JSON.stringify(user)}`];
  const dataCheckString = pairs.join("\n");
  const secretKey = crypto
    .createHmac("sha256", BOT_TOKEN)
    .update("WebAppData")
    .digest();
  const hash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  return `${pairs.join("&")}&hash=${hash}`;
}

describe("validateInitData", () => {
  it("accepts a valid signature", () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = buildInitData({ id: 42, first_name: "Test" }, now);
    const result = validateInitData(initData, BOT_TOKEN);
    assert.strictEqual(result.ok, true);
    assert.ok(result.user);
    assert.strictEqual(result.user!.id, 42);
  });

  it("rejects a tampered hash", () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = buildInitData({ id: 42, first_name: "Test" }, now).replace(
      /hash=[^&]+/,
      "hash=0000000000000000000000000000000000000000000000000000000000000000"
    );
    const result = validateInitData(initData, BOT_TOKEN);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.user, undefined);
  });

  it("rejects an expired auth_date", () => {
    const yesterday = Math.floor(Date.now() / 1000) - 90000;
    const initData = buildInitData({ id: 42, first_name: "Test" }, yesterday);
    const result = validateInitData(initData, BOT_TOKEN, 86400);
    assert.strictEqual(result.ok, false);
  });

  it("rejects missing user", () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = `auth_date=${now}&hash=abcdef`;
    const result = validateInitData(initData, BOT_TOKEN);
    assert.strictEqual(result.ok, false);
  });

  it("rejects a wrong bot token", () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = buildInitData({ id: 42, first_name: "Test" }, now);
    const result = validateInitData(initData, "wrong-token");
    assert.strictEqual(result.ok, false);
  });

  it("accepts when tried against the correct bot token among several", () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = buildInitData({ id: 42, first_name: "Test" }, now);
    const wrong = validateInitData(initData, "wrong-token-1");
    const alsoWrong = validateInitData(initData, "wrong-token-2");
    const right = validateInitData(initData, BOT_TOKEN);
    assert.strictEqual(wrong.ok, false);
    assert.strictEqual(alsoWrong.ok, false);
    assert.strictEqual(right.ok, true);
    assert.strictEqual(right.user?.id, 42);
  });
});
