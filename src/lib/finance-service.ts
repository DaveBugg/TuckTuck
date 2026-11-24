// Сервис создания расхода: общая логика между API и Telegram-ботом.
//
// Роуты готовят входные данные и проверяют права, этот модуль занимается
// валидацией, пересчётом в базовую валюту, созданием записи и аудитом.

import type { User, Expense } from "@prisma/client";
import { prisma } from "./prisma";
import { hasPermission } from "./auth";
import { writeAudit } from "./finance-audit";
import {
  validateScope,
  expenseStatusOnCreate,
  type ScopeValidationError,
} from "./finance";
import {
  parseAmount,
  parseCurrency,
  parseDate,
  parseKind,
  parseScope,
  toAmountBase,
  decimalStr,
  validationError,
} from "./finance-api";
import type { TFunc } from "./i18n/translate";

export type ExpenseInput = {
  title: string;
  description: string;
  amount: string;
  currency: string;
  amountBase: string;
  kind: "EXPENSE" | "PAYOUT";
  scope: "TEAM" | "PROJECT" | "MEMBER";
  projectId: string | null;
  memberId: string | null;
  date: Date;
  tags: string[];
  recurringId?: string | null;
};

export type PrepareExpenseResult = { error: string } | ExpenseInput;

/**
 * Проверить и нормализовать поля расхода.
 *
 * Возвращает либо объект с ошибкой, либо готовый набор полей для createExpense.
 */
export function prepareExpenseData(
  b: any,
  t: TFunc,
  displayCurrency: string,
  perUsd: Record<string, number>
): PrepareExpenseResult {
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) return validationError(t("finance.err.titleRequired"));

  const amount = parseAmount(b.amount);
  if (amount === null) return validationError(t("finance.err.amountRequired"));

  const currency = parseCurrency(b.currency);
  if (!currency) return validationError(t("finance.err.currencyRequired"));

  const description =
    typeof b.description === "string" ? b.description.trim() : "";

  const kind = parseKind(b.kind) ?? "EXPENSE";

  const scope = parseScope(b.scope);
  if (!scope) return validationError(t("finance.err.unknownScope"));

  const projectId = b.projectId !== undefined ? b.projectId || null : null;
  const memberId = b.memberId !== undefined ? b.memberId || null : null;

  let date: Date;
  if (b.date === undefined || b.date === null || b.date === "") {
    date = new Date();
  } else {
    const d = parseDate(b.date);
    if (!d) return validationError(t("finance.err.dateInvalid"));
    date = d;
  }

  const tags = Array.isArray(b.tags)
    ? b.tags
        .filter((x: unknown): x is string => typeof x === "string")
        .map((x: string) => x.trim())
    : [];

  const base = toAmountBase(amount, currency, displayCurrency, perUsd);
  if (base === null) return validationError(t("finance.err.noRate"));

  const scopeErr = validateScope(kind, scope, projectId, memberId);
  if (scopeErr) return validationError(t("finance.err.scopeValidation"));

  return {
    title,
    description,
    amount: decimalStr(amount),
    currency,
    amountBase: decimalStr(base),
    kind,
    scope,
    projectId,
    memberId,
    date,
    tags,
  };
}

export type CreateExpenseOptions = {
  me: User;
  data: ExpenseInput;
  sourceChatId?: string;
  sourceMessageId?: number;
  /** Принудительный статус, нужен для генерации из периодических шаблонов. */
  forceStatus?: Expense["status"];
};

/**
 * Создать Expense со статусом по праву создателя и записать аудит.
 */
export async function createExpense({
  me,
  data,
  sourceChatId,
  sourceMessageId,
  forceStatus,
}: CreateExpenseOptions): Promise<Expense> {
  const status =
    forceStatus ??
    expenseStatusOnCreate(hasPermission(me.role, "finance.approve"));

  const row = await prisma.expense.create({
    data: {
      title: data.title,
      description: data.description,
      amount: data.amount,
      currency: data.currency,
      amountBase: data.amountBase,
      kind: data.kind,
      scope: data.scope,
      projectId: data.projectId,
      memberId: data.memberId,
      date: data.date,
      tags: data.tags,
      recurringId: data.recurringId ?? null,
      status,
      createdById: me.id,
      sourceChatId: sourceChatId ?? "",
      sourceMessageId: sourceMessageId ?? null,
    },
  });

  await writeAudit(me.id, "CREATE", "expense", row.id, null, {
    title: data.title,
    description: data.description,
    amount: data.amount,
    currency: data.currency,
    amountBase: data.amountBase,
    kind: data.kind,
    scope: data.scope,
    projectId: data.projectId,
    memberId: data.memberId,
    date: data.date.toISOString(),
    tags: data.tags,
    recurringId: data.recurringId ?? null,
    status,
    sourceChatId: sourceChatId ?? "",
    sourceMessageId: sourceMessageId ?? null,
    createdById: me.id,
  });

  return row;
}
