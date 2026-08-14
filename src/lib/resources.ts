// Общая логика оплачиваемых ресурсов: видимость по группам, сдвиг даты оплаты
// на период, «сколько дней осталось». Вынесено из роутов, чтобы правило
// видимости было ОДНО и его нельзя было забыть в новом эндпоинте.
import type { PeriodUnit, User } from "@prisma/client";
import { hasPermission } from "./permissions";
import type { TFunc } from "./i18n/translate";

/**
 * Условие видимости для запросов к Resource.
 *
 * ТЗ: группа определяет, кто видит ресурс; по умолчанию всё видит админ.
 * Отсюда два случая:
 *   ADMIN                 — видит всё, включая ресурсы без группы;
 *   остальные             — только ресурсы групп, в которых состоят.
 *
 * Ресурс БЕЗ группы обычному пользователю не показывается намеренно: «группа не
 * задана» значит «доступ не выдавали», а не «доступ всем». Иначе забытое поле
 * молча открывало бы карточку с кредами всей команде.
 */
export function visibilityWhere(user: Pick<User, "id" | "role">) {
  if (hasPermission(user.role, "users.manage")) return {};
  return { group: { members: { some: { userId: user.id } } } };
}

/** Прибавить период к дате. Используется при отметке оплаты. */
export function addPeriod(date: Date, value: number, unit: PeriodUnit): Date {
  const d = new Date(date);
  const n = Math.max(1, value);
  switch (unit) {
    case "DAY":
      d.setDate(d.getDate() + n);
      break;
    case "WEEK":
      d.setDate(d.getDate() + n * 7);
      break;
    case "MONTH":
      // setMonth сам переносит «31 февраля» на 3 марта. Для оплат это ВЕРНО:
      // счёт всё равно выставят в существующую дату, а не пропустят месяц.
      d.setMonth(d.getMonth() + n);
      break;
    case "YEAR":
      d.setFullYear(d.getFullYear() + n);
      break;
  }
  return d;
}

/**
 * Сколько суток до оплаты. Отрицательное — просрочено.
 *
 * Считаем по КАЛЕНДАРНЫМ дням в UTC, а не по разнице миллисекунд: оплата
 * привязана ко дню, и «осталось 0.4 суток» — не тот ответ, который нужен в
 * таблице. Обе даты приводим к полуночи, поэтому переход через полночь меняет
 * число ровно на единицу.
 */
export function daysUntil(target: Date, now: Date = new Date()): number {
  const a = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86_400_000);
}

/** Пороги подсветки из ТЗ: «в ближайшие 14 / 7 / 3 дня» + просрочка. */
export type DueLevel = "overdue" | "d3" | "d7" | "d14" | "later";

export function dueLevel(days: number): DueLevel {
  if (days < 0) return "overdue";
  if (days <= 3) return "d3";
  if (days <= 7) return "d7";
  if (days <= 14) return "d14";
  return "later";
}

/** Цвет бейджа темы под уровень срочности. */
export const DUE_COLOR: Record<DueLevel, string> = {
  overdue: "destructive",
  d3: "destructive",
  d7: "warning",
  d14: "info",
  later: "secondary",
};

export const KINDS = ["SERVER", "VPN", "PROXY", "DOMAIN", "SERVICE"] as const;
export type Kind = (typeof KINDS)[number];

/**
 * Название типа ресурса.
 *
 * Функция, а не константа-словарь: константа вычислилась бы один раз при
 * загрузке модуля — то есть до того, как известен язык, — и осталась бы
 * русской навсегда.
 */
export function kindLabel(kind: Kind, t: TFunc): string {
  return t(`kind.${kind}`);
}

export const KIND_ICON: Record<Kind, string> = {
  SERVER: "ri-server-line",
  VPN: "ri-shield-keyhole-line",
  PROXY: "ri-exchange-line",
  DOMAIN: "ri-global-line",
  SERVICE: "ri-apps-2-line",
};

export const PERIOD_UNITS = ["DAY", "WEEK", "MONTH", "YEAR"] as const;

/**
 * За сколько дней напоминать по умолчанию.
 *
 * Ноль — это день оплаты. Без него напоминание за сутки оставалось последним, и
 * в сам день списания, когда ещё можно успеть, панель молчала. Порядок от
 * дальнего к ближнему — в таком виде набор и читается в карточке.
 */
export const DEFAULT_REMINDER_DAYS = [2, 1, 0] as const;

// Валюты и сети — закрытым списком, а не свободным вводом.
//
// Дело не в аккуратности: код валюты участвует в пересчёте итога по курсу, и
// опечатка вроде «USDD» не найдёт курса, из-за чего ресурс молча выпадет из
// общей суммы. Молча — худшее, что может случиться с деньгами.
export const FIAT_CURRENCIES = ["USD","EUR","RUB","GBP","KZT","UAH","TRY","CNY","AED","PLN"] as const;
export const CRYPTO_CURRENCIES = ["USDT","USDC","BTC","ETH","TON","TRX","LTC","BNB","SOL","XMR"] as const;
export const CURRENCIES = [...FIAT_CURRENCIES, ...CRYPTO_CURRENCIES] as const;

// Одна монета в разных сетях платится на разные адреса и с разной комиссией,
// поэтому сеть — отдельное поле, а не часть тикера.
export const CHAINS = [
  "TRC20", "ERC20", "BEP20", "TON", "SOL", "BTC", "LTC", "XMR", "POLYGON", "ARBITRUM",
] as const;

/** «раз в 3 мес.» / «ежемесячно» — человеческая запись периода. */
export function periodText(value: number, unit: string, t: TFunc): string {
  // Единица — не «раз в 1 месяц», а «ежемесячно»: так говорят.
  if (value === 1) return t(`period.every.${unit}`);
  return t("period.everyN", { n: value, unit: t(`period.unit.${unit}`) });
}
