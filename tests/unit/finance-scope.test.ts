// Инварианты scope/kind для расходов.
import test from "node:test";
import assert from "node:assert/strict";
import { validateScope } from "../../src/lib/finance";

test("TEAM: projectId и memberId должны быть пусты", () => {
  assert.equal(validateScope("EXPENSE", "TEAM", null, null), null);
  assert.notEqual(validateScope("EXPENSE", "TEAM", "p1", null), null);
  assert.notEqual(validateScope("EXPENSE", "TEAM", null, "m1"), null);
});

test("PROJECT: projectId обязателен", () => {
  assert.equal(validateScope("EXPENSE", "PROJECT", "p1", null), null);
  assert.notEqual(validateScope("EXPENSE", "PROJECT", null, null), null);
});

test("MEMBER: memberId обязателен, projectId опционален", () => {
  assert.equal(validateScope("EXPENSE", "MEMBER", null, "m1"), null);
  assert.equal(validateScope("EXPENSE", "MEMBER", "p1", "m1"), null);
  assert.notEqual(validateScope("EXPENSE", "MEMBER", "p1", null), null);
});

test("PAYOUT всегда требует memberId", () => {
  assert.equal(validateScope("PAYOUT", "MEMBER", null, "m1"), null);
  assert.notEqual(validateScope("PAYOUT", "TEAM", null, null), null);
  assert.notEqual(validateScope("PAYOUT", "PROJECT", "p1", null), null);
});
