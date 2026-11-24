// Чистые функции периодических расходов.
import test from "node:test";
import assert from "node:assert/strict";
import {
  nextRunAfter,
  dueTemplates,
  buildExpenseFromTemplate,
} from "../../src/lib/finance-recurring";
import type { RecurringTemplate } from "../../src/lib/finance-recurring";

function template(
  overrides: Partial<RecurringTemplate> = {}
): RecurringTemplate {
  return {
    id: "t1",
    title: "Rent",
    description: "",
    amount: { toString: () => "100.00" } as any,
    currency: "USD",
    scope: "TEAM",
    projectId: null,
    memberId: null,
    frequency: "MONTHLY",
    interval: 1,
    dayOfMonth: null,
    nextRunAt: new Date("2024-01-15T00:00:00.000Z"),
    active: true,
    createdById: "u1",
    ...overrides,
  };
}

test("nextRunAfter DAILY сдвигает на interval дней", () => {
  const from = new Date("2024-01-15T00:00:00.000Z");
  const res = nextRunAfter(from, "DAILY", 3);
  assert.equal(res.toISOString(), "2024-01-18T00:00:00.000Z");
});

test("nextRunAfter WEEKLY сдвигает на interval недель", () => {
  const from = new Date("2024-01-15T00:00:00.000Z");
  const res = nextRunAfter(from, "WEEKLY", 2);
  assert.equal(res.toISOString(), "2024-01-29T00:00:00.000Z");
});

test("nextRunAfter MONTHLY добавляет interval месяцев", () => {
  const from = new Date("2024-01-15T00:00:00.000Z");
  const res = nextRunAfter(from, "MONTHLY", 1);
  assert.equal(res.toISOString(), "2024-02-15T00:00:00.000Z");
});

test("nextRunAfter MONTHLY interval > 1", () => {
  const from = new Date("2024-01-15T00:00:00.000Z");
  const res = nextRunAfter(from, "MONTHLY", 3);
  assert.equal(res.toISOString(), "2024-04-15T00:00:00.000Z");
});

test("nextRunAfter MONTHLY клампит dayOfMonth 31 до 28 в феврале не-високосного года", () => {
  const from = new Date("2023-01-31T00:00:00.000Z");
  const res = nextRunAfter(from, "MONTHLY", 1, 31);
  assert.equal(res.toISOString(), "2023-02-28T00:00:00.000Z");
});

test("nextRunAfter MONTHLY клампит dayOfMonth 31 до 29 в феврале високосного года", () => {
  const from = new Date("2024-01-31T00:00:00.000Z");
  const res = nextRunAfter(from, "MONTHLY", 1, 31);
  assert.equal(res.toISOString(), "2024-02-29T00:00:00.000Z");
});

test("nextRunAfter YEARLY клампит dayOfMonth 29 февраля до 28 в не-високосный год", () => {
  const from = new Date("2024-02-29T00:00:00.000Z");
  const res = nextRunAfter(from, "YEARLY", 1, 29);
  assert.equal(res.toISOString(), "2025-02-28T00:00:00.000Z");
});

test("nextRunAfter YEARLY interval > 1", () => {
  const from = new Date("2024-03-15T00:00:00.000Z");
  const res = nextRunAfter(from, "YEARLY", 2);
  assert.equal(res.toISOString(), "2026-03-15T00:00:00.000Z");
});

test("nextRunAfter игнорирует interval < 1", () => {
  const from = new Date("2024-01-15T00:00:00.000Z");
  const res = nextRunAfter(from, "DAILY", 0);
  assert.equal(res.toISOString(), "2024-01-16T00:00:00.000Z");
});

test("dueTemplates отбирает только активные и наступившие", () => {
  const now = new Date("2024-01-15T12:00:00.000Z");
  const rows: RecurringTemplate[] = [
    template({ id: "a", nextRunAt: new Date("2024-01-14T00:00:00.000Z") }),
    template({ id: "b", nextRunAt: new Date("2024-01-15T12:00:00.000Z") }),
    template({ id: "c", nextRunAt: new Date("2024-01-16T00:00:00.000Z") }),
    template({
      id: "d",
      nextRunAt: new Date("2024-01-14T00:00:00.000Z"),
      active: false,
    }),
  ];
  const due = dueTemplates(rows, now);
  assert.equal(due.length, 2);
  assert.ok(due.some(t => t.id === "a"));
  assert.ok(due.some(t => t.id === "b"));
});

test("buildExpenseFromTemplate формирует APPROVED EXPENSE с recurringId", () => {
  const t = template({
    title: "Server",
    description: "Hetzner",
    scope: "PROJECT",
    projectId: "p1",
    nextRunAt: new Date("2024-02-01T00:00:00.000Z"),
  });
  const e = buildExpenseFromTemplate(t);
  assert.equal(e.kind, "EXPENSE");
  assert.equal(e.status, "APPROVED");
  assert.equal(e.title, "Server");
  assert.equal(e.description, "Hetzner");
  assert.equal(e.amount, "100.00");
  assert.equal(e.currency, "USD");
  assert.equal(e.scope, "PROJECT");
  assert.equal(e.projectId, "p1");
  assert.equal(e.recurringId, "t1");
  assert.equal(e.date.toISOString(), "2024-02-01T00:00:00.000Z");
  assert.deepEqual(e.tags, []);
});
