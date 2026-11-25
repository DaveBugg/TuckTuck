// Статистика доходов/расходов проекта по месяцам.
import test from "node:test";
import assert from "node:assert/strict";
import { buildMonthlyStats } from "../../src/lib/finance";

test("buildMonthlyStats: группирует доходы и расходы по месяцам", () => {
  const stats = buildMonthlyStats(
    [
      { amountBase: 100, date: "2026-01-15T00:00:00Z" },
      { amountBase: 50, date: "2026-01-20T00:00:00Z" },
      { amountBase: 70, date: "2026-02-05T00:00:00Z" },
    ],
    [
      { amountBase: 30, date: "2026-01-10T00:00:00Z" },
      { amountBase: 20, date: "2026-02-12T00:00:00Z" },
    ]
  );
  assert.deepEqual(stats["2026-01"], { income: 150, expense: 30 });
  assert.deepEqual(stats["2026-02"], { income: 70, expense: 20 });
});

test("buildMonthlyStats: пустые массивы — пустой результат", () => {
  const stats = buildMonthlyStats([], []);
  assert.deepEqual(stats, {});
});

test("buildMonthlyStats: принимает Date", () => {
  const stats = buildMonthlyStats(
    [{ amountBase: "200", date: new Date(Date.UTC(2026, 5, 1)) }],
    []
  );
  assert.deepEqual(stats["2026-06"], { income: 200, expense: 0 });
});

test("buildMonthlyStats: суммы накапливаются в одном месяце", () => {
  const now = new Date().toISOString();
  const stats = buildMonthlyStats(
    [
      { amountBase: 10, date: now },
      { amountBase: 20, date: now },
    ],
    [
      { amountBase: 5, date: now },
      { amountBase: 3, date: now },
    ]
  );
  const key = new Date().toISOString().slice(0, 7);
  assert.deepEqual(stats[key], { income: 30, expense: 8 });
});
