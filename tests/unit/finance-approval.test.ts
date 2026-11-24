// Статусы расходов: начальный статус и допустимые переходы.
import test from "node:test";
import assert from "node:assert/strict";
import {
  expenseStatusOnCreate,
  canTransitionStatus,
} from "../../src/lib/finance";

test("expenseStatusOnCreate: с правом approve — APPROVED", () => {
  assert.equal(expenseStatusOnCreate(true), "APPROVED");
});

test("expenseStatusOnCreate: без права approve — PENDING", () => {
  assert.equal(expenseStatusOnCreate(false), "PENDING");
});

test("canTransitionStatus: PENDING → APPROVED/REJECTED", () => {
  assert.equal(canTransitionStatus("PENDING", "APPROVED"), true);
  assert.equal(canTransitionStatus("PENDING", "REJECTED"), true);
});

test("canTransitionStatus: REJECTED финален", () => {
  assert.equal(canTransitionStatus("REJECTED", "PENDING"), false);
  assert.equal(canTransitionStatus("REJECTED", "APPROVED"), false);
  assert.equal(canTransitionStatus("REJECTED", "REJECTED"), true);
});

test("canTransitionStatus: APPROVED → только сам себе", () => {
  assert.equal(canTransitionStatus("APPROVED", "APPROVED"), true);
  assert.equal(canTransitionStatus("APPROVED", "PENDING"), false);
  assert.equal(canTransitionStatus("APPROVED", "REJECTED"), false);
});
