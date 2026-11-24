// Распределение дохода по долям: проценты, остаток, фиксированные суммы.
import test from "node:test";
import assert from "node:assert/strict";
import { splitIncome } from "../../src/lib/finance";

const members = [
  { memberId: "a", percent: 50 },
  { memberId: "b", percent: 30 },
  { memberId: "c", percent: 20 },
];

test("splitIncome: сумма начислений равна исходной", () => {
  const result = splitIncome(100, members);
  const total = result.reduce((acc, r) => acc + r.amountBase, 0);
  assert.equal(total, 100);
});

test("splitIncome: округление до 2 знаков, остаток у последнего", () => {
  const result = splitIncome(100, members);
  assert.deepEqual(
    result.map(r => r.amountBase),
    [50, 30, 20]
  );
});

test("splitIncome: не делимая сумма уходит последнему", () => {
  // 33.33 + 33.33 + 33.34 = 100
  const result = splitIncome(100, [
    { memberId: "a", percent: 33.33 },
    { memberId: "b", percent: 33.33 },
    { memberId: "c", percent: 33.34 },
  ]);
  const total = result.reduce((acc, r) => acc + r.amountBase, 0);
  assert.equal(total, 100);
  assert.equal(result[result.length - 1].amountBase, 33.34);
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

test("splitIncome: сумма процентов не 100 — пересчитывает пропорционально", () => {
  const result = splitIncome(100, [
    { memberId: "a", percent: 1 },
    { memberId: "b", percent: 1 },
  ]);
  assert.equal(result[0].amountBase, 50);
  assert.equal(result[1].amountBase, 50);
});
