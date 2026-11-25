// Чистые функции бизнес-логики Finance Board. Не содержат вызовов БД —
// тестируются без базы, а роуты передают сюда уже выбранные агрегации.

import type { ExpenseKind, ExpenseStatus, FinanceScope } from "@prisma/client";

type DecimalLike = { toNumber(): number };
type AmountValue = number | string | DecimalLike;

function toNum(v: AmountValue): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return v.toNumber();
}

function sum(items: { amountBase: AmountValue }[]): number {
  return items.reduce((acc, x) => acc + toNum(x.amountBase), 0);
}

/** Баланс участника: все начисления минус все выплаты (PAYOUT). */
export function memberBalance(
  distributions: { amountBase: AmountValue }[],
  payouts: { amountBase: AmountValue }[]
): number {
  return sum(distributions) - sum(payouts);
}

/** Баланс проекта: доходы минус распределения с проекта минус расходы (EXPENSE). */
export function projectBalance(
  incomes: { amountBase: AmountValue }[],
  distributions: { amountBase: AmountValue }[],
  expenses: { amountBase: AmountValue; kind?: ExpenseKind | string }[]
): number {
  const expenseTotal = expenses
    .filter(e => (e.kind ?? "EXPENSE") === "EXPENSE")
    .reduce((acc, x) => acc + toNum(x.amountBase), 0);
  return sum(incomes) - sum(distributions) - expenseTotal;
}

/** Баланс команды: все доходы минус все распределения минус все расходы и выплаты. */
export function teamBalance(
  incomes: { amountBase: AmountValue }[],
  distributions: { amountBase: AmountValue }[],
  expenses: { amountBase: AmountValue; kind: ExpenseKind | string }[]
): number {
  return (
    sum(incomes) -
    sum(distributions) -
    expenses.reduce((acc, x) => acc + toNum(x.amountBase), 0)
  );
}

export type SplitMember = { memberId: string; percent: number };
export type SplitResult = {
  memberId: string;
  amountBase: number;
  percent: number;
};

/**
 * Распределить доход по долям участников.
 *
 * Каждому начисляется строгий процент от суммы (не нормализуем доли).
 * Округляем до 2 знаков; остаток, включая когда сумма долей < 100%,
 * остаётся на балансе проекта. Отрицательные доли отбраковываются.
 */
export function splitIncome(
  amountBase: number,
  members: SplitMember[]
): SplitResult[] {
  if (!members.length || amountBase <= 0) return [];
  if (members.some(m => m.percent < 0)) return [];

  return members.map(m => ({
    memberId: m.memberId,
    amountBase: Math.round(((amountBase * m.percent) / 100) * 100) / 100,
    percent: m.percent,
  }));
}

export type ScopeValidationError = string;

/**
 * Проверить инварианты scope/kind из §3.
 *
 * - TEAM: без projectId и memberId.
 * - PROJECT: projectId обязателен.
 * - MEMBER: memberId обязателен, projectId опционален.
 * - PAYOUT: memberId обязателен (выплата конкретному участнику).
 */
export function validateScope(
  kind: ExpenseKind | string,
  scope: FinanceScope | string,
  projectId: string | null | undefined,
  memberId: string | null | undefined
): ScopeValidationError | null {
  const hasProject = Boolean(projectId);
  const hasMember = Boolean(memberId);

  if (scope === "TEAM" && (hasProject || hasMember)) {
    return "scope.team.noContext";
  }
  if (scope === "PROJECT" && !hasProject) {
    return "scope.project.projectIdRequired";
  }
  if (scope === "MEMBER" && !hasMember) {
    return "scope.member.memberIdRequired";
  }
  if (kind === "PAYOUT" && !hasMember) {
    return "payout.memberIdRequired";
  }
  return null;
}

/** Статус нового расхода: с правом approve — сразу APPROVED, иначе PENDING. */
export function expenseStatusOnCreate(
  hasApprovePermission: boolean
): ExpenseStatus {
  return hasApprovePermission ? "APPROVED" : "PENDING";
}

/** Допустимые переходы статусов расхода. */
export function canTransitionStatus(
  from: ExpenseStatus | string,
  to: ExpenseStatus | string
): boolean {
  if (from === to) return true;
  if (from === "PENDING" && (to === "APPROVED" || to === "REJECTED"))
    return true;
  // REJECTED финален; APPROVED правится через finance.manage, но не через approve.
  return false;
}

/** Сколько «к выплате» — сумма положительных балансов участников. */
export function totalPayable(memberBalances: number[]): number {
  return memberBalances.reduce((acc, b) => acc + (b > 0 ? b : 0), 0);
}
