// Чистые функции Telegram-бота Finance Board.
//
// Здесь нет обращений к БД и сети: парсинг сумм, нормализация валют, сборка
// клавиатур и маршрутизация карточек аппрува. Всё тестируется без базы.

import type { InlineButton } from "./telegram";
import type { FinanceScope, Expense } from "@prisma/client";

export const TG_PAGE_SIZE = 8;
export const TG_CURRENCY_ROW = 3;

export type FsmState =
  | { step: "idle" }
  | { step: "awaitAmount" }
  | { step: "awaitCurrency"; amount: number }
  | { step: "awaitScope"; amount: number; currency: string }
  | { step: "awaitProject"; amount: number; currency: string }
  | {
      step: "awaitMember";
      amount: number;
      currency: string;
      projectId?: string;
    }
  | {
      step: "awaitTitle";
      amount: number;
      currency: string;
      scope: FinanceScope;
      projectId?: string;
      memberId?: string;
    }
  | {
      step: "awaitTags";
      amount: number;
      currency: string;
      scope: FinanceScope;
      projectId?: string;
      memberId?: string;
      title: string;
      description: string;
      selectedTags: string[];
    }
  | {
      step: "confirm";
      amount: number;
      currency: string;
      scope: FinanceScope;
      projectId?: string;
      memberId?: string;
      title: string;
      description: string;
      tags: string[];
    };

export type ProjectItem = { id: string; name: string };
export type MemberItem = { id: string; name: string };

/**
 * Распарсить сумму из произвольного текста.
 *
 * Поддерживает пробелы как разделители тысяч и запятую как десятичный знак:
 * "4200", "4 200,50", "1 234.56".
 */
export function parseAmountText(text: string): number | null {
  const normalized = text.replace(/\s+/g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Нормализовать код валюты: верхний регистр, 2–10 латинских букв. */
export function normalizeCurrency(code: string): string | null {
  const c = code.trim().toUpperCase();
  return /^[A-Z]{2,10}$/.test(c) ? c : null;
}

/** Разделить сообщение на название и описание по длинному тире. */
export function splitTitleDescription(text: string): {
  title: string;
  description: string;
} {
  const parts = text.split(/\s+[-–—]\s+/, 2);
  return {
    title: parts[0].trim(),
    description: parts[1]?.trim() ?? "",
  };
}

export function buildCurrencyKeyboard(
  currencies: string[],
  otherLabel: string
): InlineButton[][] {
  const rows: InlineButton[][] = [];
  for (let i = 0; i < currencies.length; i += TG_CURRENCY_ROW) {
    rows.push(
      currencies.slice(i, i + TG_CURRENCY_ROW).map(c => ({
        text: c,
        callback_data: `cur:${c}`,
      }))
    );
  }
  rows.push([{ text: otherLabel, callback_data: "curo" }]);
  return rows;
}

export function buildScopeKeyboard(labels: {
  team: string;
  project: string;
  member: string;
}): InlineButton[][] {
  return [
    [
      { text: labels.team, callback_data: "scope:TEAM" },
      { text: labels.project, callback_data: "scope:PROJECT" },
      { text: labels.member, callback_data: "scope:MEMBER" },
    ],
  ];
}

function paginationButtons(
  page: number,
  total: number,
  pageSize: number,
  prefix: string
): InlineButton[] {
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const out: InlineButton[] = [];
  if (page > 0) {
    out.push({ text: "←", callback_data: `${prefix}p:${page - 1}` });
  }
  if (page < lastPage) {
    out.push({ text: "→", callback_data: `${prefix}p:${page + 1}` });
  }
  return out;
}

export function buildListKeyboard<T extends { id: string; name: string }>(
  items: T[],
  page: number,
  prefix: string
): InlineButton[][] {
  const start = page * TG_PAGE_SIZE;
  const slice = items.slice(start, start + TG_PAGE_SIZE);
  const rows: InlineButton[][] = slice.map(item => [
    { text: item.name, callback_data: `${prefix}:${item.id}` },
  ]);
  const nav = paginationButtons(page, items.length, TG_PAGE_SIZE, prefix);
  if (nav.length) rows.push(nav);
  return rows;
}

export function buildProjectKeyboard(
  projects: ProjectItem[],
  page: number
): InlineButton[][] {
  return buildListKeyboard(projects, page, "proj");
}

export function buildMemberKeyboard(
  members: MemberItem[],
  page: number
): InlineButton[][] {
  return buildListKeyboard(members, page, "mem");
}

export function buildTagsKeyboard(
  tags: string[],
  selected: Set<string>,
  doneLabel: string,
  skipLabel: string
): InlineButton[][] {
  const rows: InlineButton[][] = [];
  const chipRow: InlineButton[] = [];
  for (const tag of tags) {
    const mark = selected.has(tag) ? "✅ " : "";
    chipRow.push({
      text: `${mark}${tag}`,
      callback_data: `tag:${tag}`,
    });
    if (chipRow.length >= 3) {
      rows.push([...chipRow]);
      chipRow.length = 0;
    }
  }
  if (chipRow.length) rows.push([...chipRow]);
  rows.push([
    { text: skipLabel, callback_data: "tags-skip" },
    { text: doneLabel, callback_data: "tags-done" },
  ]);
  return rows;
}

export function buildConfirmKeyboard(
  sendLabel: string,
  cancelLabel: string
): InlineButton[][] {
  return [
    [{ text: sendLabel, callback_data: "confirm" }],
    [{ text: cancelLabel, callback_data: "tg-cancel" }],
  ];
}

export type ApprovalTarget =
  { chatId: string; messageId?: number } | { dm: true };

/**
 * Определить, куда отправлять карточку аппрува.
 *
 * Если расход создан в Telegram-группе (sourceChatId задан) — карточка туда же.
 * Иначе — в ЛС финансисту (выбор финансиста происходит уже в обработчике).
 */
export function decideApprovalTarget(
  expense: Pick<Expense, "sourceChatId" | "sourceMessageId">
): ApprovalTarget {
  if (expense.sourceChatId) {
    return {
      chatId: expense.sourceChatId,
      messageId: expense.sourceMessageId ?? undefined,
    };
  }
  return { dm: true };
}

/** Префиксы callback-данных, относящихся к Finance Board. */
export const FINANCE_CALLBACK_PREFIXES = [
  "cur:",
  "curo",
  "scope:",
  "proj",
  "mem",
  "tag:",
  "tags-",
  "confirm",
  "tg-cancel",
  "fina:",
  "finr:",
  "menu-expense",
  "menu-balance",
];

export function isFinanceCallback(data: string): boolean {
  return FINANCE_CALLBACK_PREFIXES.some(p => data === p || data.startsWith(p));
}
