// Распределение дохода по долям: строгие проценты, остаток на проекте.
import test from "node:test";
import assert from "node:assert/strict";
import { splitIncome } from "../../src/lib/finance";

const members = [
  { memberId: "a", percent: 50 },
  { memberId: "b", percent: 30 },
  { memberId: "c", percent: 20 },
];

test("splitIncome: распределяет строго по процентам", () => {
  const result = splitIncome(100, members);
  assert.deepEqual(
    result.map(r => r.amountBase),
    [50, 30, 20]
  );
});

test("splitIncome: сумма начислений ≤ исходной (остаток на проекте)", () => {
  const result = splitIncome(100, members);
  const total = result.reduce((acc, r) => acc + r.amountBase, 0);
  assert.ok(total <= 100);
  assert.equal(total, 100);
});

test("splitIncome: округление до 2 знаков", () => {
  // 33.333... → 33.33, каждый получает свой rounded share.
  const result = splitIncome(100, [
    { memberId: "a", percent: 33.33 },
    { memberId: "b", percent: 33.33 },
    { memberId: "c", percent: 33.34 },
  ]);
  assert.equal(result[0].amountBase, 33.33);
  assert.equal(result[1].amountBase, 33.33);
  assert.equal(result[2].amountBase, 33.34);
  const total = result.reduce((acc, r) => acc + r.amountBase, 0);
  assert.ok(total <= 100);
});

test("splitIncome: остаток остаётся на проекте при сумме долей < 100%", () => {
  const result = splitIncome(100, [
    { memberId: "a", percent: 30 },
    { memberId: "b", percent: 20 },
  ]);
  assert.equal(result[0].amountBase, 30);
  assert.equal(result[1].amountBase, 20);
  const total = result.reduce((acc, r) => acc + r.amountBase, 0);
  assert.equal(total, 50);
});

test("splitIncome: не нормализует доли при сумме ≠ 100%", () => {
  const result = splitIncome(100, [
    { memberId: "a", percent: 1 },
    { memberId: "b", percent: 1 },
  ]);
  assert.equal(result[0].amountBase, 1);
  assert.equal(result[1].amountBase, 1);
  const total = result.reduce((acc, r) => acc + r.amountBase, 0);
  assert.equal(total, 2);
});

test("splitIncome: пустые участники — пустой результат", () => {
  assert.deepEqual(splitIncome(100, []), []);
});

test("splitIncome: нулевая сумма — пустой результат", () => {
  assert.deepEqual(splitIncome(0, members), []);
});

test("splitIncome: сохраняет исходные проценты", () => {
  const result = splitIncome(100, members);
  assert.deepEqual(
    result.map(r => r.percent),
    [50, 30, 20]
  );
});

test("splitIncome: отбраковывает отрицательные проценты", () => {
  const result = splitIncome(100, [
    { memberId: "a", percent: 50 },
    { memberId: "b", percent: -10 },
  ]);
  assert.deepEqual(result, []);
});
