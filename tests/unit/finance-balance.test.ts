// Формулы балансов Finance Board (участник / проект / команда).
import test from "node:test";
import assert from "node:assert/strict";
import {
  memberBalance,
  projectBalance,
  teamBalance,
  totalPayable,
} from "../../src/lib/finance";

const amount = (n: number) => ({ amountBase: n });
const expense = (n: number, kind: "EXPENSE" | "PAYOUT" = "EXPENSE") => ({
  amountBase: n,
  kind,
});

test("memberBalance = начисления − выплаты", () => {
  assert.equal(memberBalance([amount(100), amount(50)], [amount(30)]), 120);
});

test("memberBalance: пустые массивы — 0", () => {
  assert.equal(memberBalance([], []), 0);
});

test("memberBalance: только выплаты — отрицательный", () => {
  assert.equal(memberBalance([], [amount(200)]), -200);
});

test("projectBalance = доходы − распределения − расходы (EXPENSE)", () => {
  assert.equal(
    projectBalance([amount(1000)], [amount(300)], [expense(150)]),
    550
  );
});

test("projectBalance: PAYOUT не вычитается дважды", () => {
  // В балансе проекта PAYOUT не учитывается — он уходит на участника/команду.
  assert.equal(
    projectBalance([amount(1000)], [amount(100)], [expense(200, "PAYOUT")]),
    900
  );
});

test("teamBalance = доходы − распределения − все расходы − выплаты", () => {
  assert.equal(
    teamBalance(
      [amount(1000)],
      [amount(200)],
      [expense(150), expense(50, "PAYOUT")]
    ),
    600
  );
});

test("totalPayable — сумма только положительных балансов", () => {
  assert.equal(totalPayable([100, -20, 0, 55.5]), 155.5);
});

test("totalPayable: все отрицательные — 0", () => {
  assert.equal(totalPayable([-10, -5]), 0);
});
