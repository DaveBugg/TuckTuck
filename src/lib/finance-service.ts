// Сервис создания расхода: общая логика между API и Telegram-ботом.
//
// Роуты готовят входные данные и проверяют права, этот модуль занимается
// валидацией, пересчётом в базовую валюту, созданием записи и аудитом.

import type { User, Expense, Prisma } from "@/generated/prisma/client";
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
  resourceId?: string | null;
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
  me?: User | null;
  data: ExpenseInput;
  sourceChatId?: string;
  sourceMessageId?: number;
  /** Принудительный статус, нужен для генерации из периодических шаблонов. */
  forceStatus?: Expense["status"];
  tx?: Prisma.TransactionClient;
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
  tx,
}: CreateExpenseOptions): Promise<Expense> {
  const status =
    forceStatus ??
    expenseStatusOnCreate(
      me ? hasPermission(me.role, "finance.approve") : false
    );

  const client = tx ?? prisma;
  const row = await client.expense.create({
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
      resourceId: data.resourceId ?? null,
      date: data.date,
      tags: data.tags,
      recurringId: data.recurringId ?? null,
      status,
      createdById: me?.id ?? null,
      sourceChatId: sourceChatId ?? "",
      sourceMessageId: sourceMessageId ?? null,
    },
  });

  await writeAudit(
    me?.id ?? null,
    "CREATE",
    "expense",
    row.id,
    null,
    {
      title: data.title,
      description: data.description,
      amount: data.amount,
      currency: data.currency,
      amountBase: data.amountBase,
      kind: data.kind,
      scope: data.scope,
      projectId: data.projectId,
      memberId: data.memberId,
      resourceId: data.resourceId ?? null,
      date: data.date.toISOString(),
      tags: data.tags,
      recurringId: data.recurringId ?? null,
      status,
      sourceChatId: sourceChatId ?? "",
      sourceMessageId: sourceMessageId ?? null,
      createdById: me?.id ?? null,
    },
    tx
  );

  return row;
}

export type ResourcePaymentExpenseInput = {
  resource: { id: string; name: string; projectId: string | null };
  payment: {
    amount: string | number | { toNumber(): number };
    currency: string;
    paidAt: Date;
  };
  displayCurrency: string;
  perUsd: Record<string, number>;
  t: TFunc;
};

/**
 * Подготовить ExpenseInput из оплаты привязанного ресурса.
 *
 * Чистая функция: считает amountBase через курсы и формирует понятное
 * пользователю название. Возвращает ошибку, если курс неизвестен.
 */
export function buildExpenseFromPayment({
  resource,
  payment,
  displayCurrency,
  perUsd,
  t,
}: ResourcePaymentExpenseInput): ExpenseInput | { error: string } {
  if (!resource.projectId) {
    return { error: t("finance.err.projectIdRequired") };
  }
  const amountNum = Number(payment.amount);
  if (!isFinite(amountNum) || amountNum < 0) {
    return { error: t("finance.err.amountRequired") };
  }
  const base = toAmountBase(
    amountNum,
    payment.currency,
    displayCurrency,
    perUsd
  );
  if (base === null) return { error: t("finance.err.noRate") };
  return {
    title: t("finance.expense.resourcePaymentTitle", { name: resource.name }),
    description: "",
    amount: decimalStr(amountNum),
    currency: payment.currency,
    amountBase: decimalStr(base),
    kind: "EXPENSE",
    scope: "PROJECT",
    projectId: resource.projectId,
    memberId: null,
    date: payment.paidAt,
    tags: [],
    resourceId: resource.id,
  };
}

/**
 * Создать Expense после записи оплаты ресурса, если ресурс привязан к проекту.
 *
 * При отсутствии проекта молча возвращает null — такие оплаты не порождают
 * расход. При ошибке курса бросает исключение, чтобы транзакция откатилась
 * и вызывающий код мог сообщить о проблеме.
 */
export async function createExpenseFromResourcePayment({
  resource,
  payment,
  me,
  displayCurrency,
  perUsd,
  t,
  tx,
}: ResourcePaymentExpenseInput & {
  me?: User | null;
  tx?: Prisma.TransactionClient;
}): Promise<Expense | null> {
  if (!resource.projectId) return null;
  const prepared = buildExpenseFromPayment({
    resource,
    payment,
    displayCurrency,
    perUsd,
    t,
  });
  if ("error" in prepared) {
    throw new Error(prepared.error);
  }
  return createExpense({
    me,
    data: prepared,
    forceStatus: "APPROVED",
    tx,
  });
}
