// Чистые функции периодических расходов. Не содержат вызовов БД.

import type {
  RecurringExpense,
  RecurringFrequency,
} from "@/generated/prisma/client";

export type RecurringTemplate = Pick<
  RecurringExpense,
  | "id"
  | "title"
  | "description"
  | "amount"
  | "currency"
  | "scope"
  | "projectId"
  | "memberId"
  | "frequency"
  | "interval"
  | "dayOfMonth"
  | "nextRunAt"
  | "active"
  | "createdById"
>;

/** Данные Expense, порождённые из шаблона периодического расхода. */
export type ExpenseFromTemplate = {
  kind: "EXPENSE";
  status: "APPROVED";
  title: string;
  description: string;
  amount: string;
  currency: string;
  date: Date;
  scope: RecurringExpense["scope"];
  projectId: string | null;
  memberId: string | null;
  recurringId: string;
  tags: string[];
};

/**
 * Следующая дата запуска после `from` по правилам шаблона.
 *
 * - DAILY/WEEKLY: просто сдвигаем дату.
 * - MONTHLY/YEARLY: сдвигаем период, затем применяем dayOfMonth с клампом
 *   по числу дней целевого месяца (31 → 28/29 февраля).
 */
export function nextRunAfter(
  from: Date,
  frequency: RecurringFrequency,
  interval: number,
  dayOfMonth?: number | null
): Date {
  const n = Math.max(1, interval);

  switch (frequency) {
    case "DAILY":
      return addDays(from, n);
    case "WEEKLY":
      return addDays(from, n * 7);
    case "MONTHLY": {
      const year = from.getUTCFullYear();
      const month = from.getUTCMonth() + n;
      return buildDate(year, month, from.getUTCDate(), dayOfMonth);
    }
    case "YEARLY": {
      const year = from.getUTCFullYear() + n;
      const month = from.getUTCMonth();
      return buildDate(year, month, from.getUTCDate(), dayOfMonth);
    }
  }
}

function addDays(from: Date, n: number): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function buildDate(
  year: number,
  month: number,
  originalDay: number,
  dayOfMonth?: number | null
): Date {
  const targetDay = dayOfMonth && dayOfMonth >= 1 ? dayOfMonth : originalDay;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(targetDay, lastDay)));
}

/** Шаблоны, у которых наступило время запуска. */
export function dueTemplates(
  templates: RecurringTemplate[],
  now: Date
): RecurringTemplate[] {
  return templates.filter(t => t.active && t.nextRunAt <= now);
}

/** Сформировать данные Expense из шаблона (без amountBase — его считает роут). */
export function buildExpenseFromTemplate(
  t: RecurringTemplate
): ExpenseFromTemplate {
  return {
    kind: "EXPENSE",
    status: "APPROVED",
    title: t.title,
    description: t.description ?? "",
    amount: t.amount.toString(),
    currency: t.currency,
    date: t.nextRunAt,
    scope: t.scope,
    projectId: t.projectId ?? null,
    memberId: t.memberId ?? null,
    recurringId: t.id,
    tags: [],
  };
}
