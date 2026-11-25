// Общие хелперы API Finance Board: парсинг тел, конвертация валют, сериализация.

import { convert } from "./rates";
import type {
  ExpenseKind,
  ExpenseStatus,
  FinanceScope,
  RecurringFrequency,
} from "@/generated/prisma/client";

export const EXPENSE_KINDS: ExpenseKind[] = ["EXPENSE", "PAYOUT"];
export const EXPENSE_STATUSES: ExpenseStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
];
export const SCOPES: FinanceScope[] = ["TEAM", "PROJECT", "MEMBER"];
export const RECURRING_FREQUENCIES: RecurringFrequency[] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
];

export function parseAmount(value: unknown): number | null {
  if (typeof value === "number")
    return isFinite(value) && value >= 0 ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

export function parseCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const c = value.trim().toUpperCase();
  return /^[A-Z]{2,10}$/.test(c) ? c : null;
}

export function parseDate(value: unknown): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
}

export function parseScope(value: unknown): FinanceScope | null {
  return SCOPES.includes(value as FinanceScope)
    ? (value as FinanceScope)
    : null;
}

export function parseKind(value: unknown): ExpenseKind | null {
  return EXPENSE_KINDS.includes(value as ExpenseKind)
    ? (value as ExpenseKind)
    : null;
}

export function parseFrequency(value: unknown): RecurringFrequency | null {
  return RECURRING_FREQUENCIES.includes(value as RecurringFrequency)
    ? (value as RecurringFrequency)
    : null;
}

export function parseInterval(value: unknown): number | null {
  if (typeof value === "number")
    return Number.isInteger(value) && value >= 1 ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 ? n : null;
  }
  return null;
}

export function parseDayOfMonth(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number")
    return Number.isInteger(value) && value >= 1 && value <= 31 ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
  }
  return null;
}

/** Пересчитать сумму в базовую валюту. null — курс неизвестен. */
export function toAmountBase(
  amount: number,
  currency: string,
  displayCurrency: string,
  perUsd: Record<string, number>
): number | null {
  const base = convert(amount, currency, displayCurrency, perUsd);
  if (base === null) return null;
  return Math.round(base * 1e8) / 1e8;
}

/** Сформировать Decimal-строку для Prisma с заданной точностью. */
export function decimalStr(value: number, digits = 8): string {
  return value.toFixed(digits);
}

export function serializeDecimal(
  value: { toString(): string } | null | undefined
): string | null {
  if (!value) return null;
  return value.toString();
}

/** Единый вид ошибки валидации тела — роуты возвращают 400 с этим текстом. */
export function validationError(message: string): { error: string } {
  return { error: message };
}
