// Расписание платежей и суммы по календарным месяцам.
//
// Раньше расход «в месяц» считался усреднением: годовая подписка добавляла
// свою двенадцатую часть в каждый месяц. Число получалось гладким, но не
// отвечало на вопрос, который задают на самом деле — «сколько уйдёт в этом
// месяце». В марте, когда приходит годовой счёт, усреднение показывает ту же
// цифру, что и в феврале, хотя платить надо в двенадцать раз больше.
//
// Поэтому здесь считаются НАСТОЯЩИЕ платежи: расписание разворачивается от
// известной даты следующей оплаты назад и вперёд с шагом периода, и каждый
// платёж попадает в свой календарный месяц. Это же даёт годовую динамику,
// на которой видно кварталы и годовые счета.

import { addPeriod } from "./resources";

export type SpendResource = {
  amount: string | number;
  currency: string;
  isCrypto: boolean;
  periodValue: number;
  periodUnit: string;
  /** Дата следующей оплаты — якорь, от которого разворачивается расписание. */
  nextPaymentAt: Date;
};

/** Сумма по валюте: точная, без пересчёта по курсу. */
export type CurrencySum = { currency: string; isCrypto: boolean; count: number; amount: number };

/**
 * Шаг назад по периоду. Обратный addPeriod.
 *
 * Отдельная функция, а не addPeriod с минусом: у месяцев и лет сдвиг
 * несимметричен (31 марта минус месяц — это 3 марта, а не 28 февраля), и
 * прятать это в один вызов со знаком значило бы прятать ошибку.
 */
function subPeriod(date: Date, value: number, unit: string): Date {
  const d = new Date(date);
  const n = Math.max(1, value);
  switch (unit) {
    case "DAY":
      d.setUTCDate(d.getUTCDate() - n);
      break;
    case "WEEK":
      d.setUTCDate(d.getUTCDate() - n * 7);
      break;
    case "YEAR":
      d.setUTCFullYear(d.getUTCFullYear() - n);
      break;
    default:
      d.setUTCMonth(d.getUTCMonth() - n);
  }
  return d;
}

/** Тот же шаг вперёд, но в UTC — даты оплат хранятся датой без времени. */
function nextOccurrence(date: Date, value: number, unit: string): Date {
  const d = addPeriod(new Date(date), value, unit as any);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// Предохранитель от бесконечного цикла: год ежедневных платежей — это 366
// событий, всё сверх тысячи означает, что период посчитан неверно.
const MAX_OCCURRENCES = 1000;

/**
 * Даты платежей ресурса, попадающие в [from, to).
 *
 * Расписание разворачивается от nextPaymentAt: назад, пока не уйдём раньше
 * начала, и вперёд, пока не выйдем за конец. Прошлые месяцы года считаются
 * так же, как будущие, — иначе «динамика за год» обрывалась бы на сегодняшнем
 * дне и по ней нельзя было бы увидеть, когда приходил годовой счёт.
 */
export function occurrencesBetween(r: SpendResource, from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const value = Math.max(1, r.periodValue);

  // Отматываем назад до первого платежа, который не раньше начала интервала.
  let cur = new Date(
    Date.UTC(
      r.nextPaymentAt.getUTCFullYear(),
      r.nextPaymentAt.getUTCMonth(),
      r.nextPaymentAt.getUTCDate()
    )
  );
  let guard = 0;
  while (cur.getTime() >= from.getTime() && guard++ < MAX_OCCURRENCES) {
    cur = subPeriod(cur, value, r.periodUnit);
  }
  // Теперь cur строго раньше from — шагаем вперёд и собираем попадания.
  guard = 0;
  while (guard++ < MAX_OCCURRENCES) {
    cur = nextOccurrence(cur, value, r.periodUnit);
    if (cur.getTime() >= to.getTime()) break;
    if (cur.getTime() >= from.getTime()) out.push(new Date(cur));
  }
  return out;
}

/** Сумма платежей ресурса, попавших в интервал. Валюта не меняется. */
export function amountBetween(r: SpendResource, from: Date, to: Date): number {
  const n = occurrencesBetween(r, from, to).length;
  return n * Number(r.amount);
}

/** Границы календарного месяца в UTC. */
export function monthRange(year: number, monthIndex: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, monthIndex, 1)),
    to: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

/** Свести платежи интервала по валютам. */
export function sumByCurrency(rows: SpendResource[], from: Date, to: Date): CurrencySum[] {
  const map = new Map<string, CurrencySum>();
  for (const r of rows) {
    const amount = amountBetween(r, from, to);
    if (amount === 0) continue;
    const currency = r.currency.toUpperCase();
    const acc = map.get(currency) ?? {
      currency,
      isCrypto: r.isCrypto,
      count: 0,
      amount: 0,
    };
    acc.amount += amount;
    acc.count += 1;
    map.set(currency, acc);
  }
  return [...map.values()]
    .map(v => ({
      ...v,
      // Крипте нужны знаки: 0.0004 BTC при округлении до копеек стало бы нулём.
      amount: v.isCrypto ? Math.round(v.amount * 1e8) / 1e8 : Math.round(v.amount * 100) / 100,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Двенадцать месяцев года: суммы по валютам в каждом. */
export function byMonth(rows: SpendResource[], year: number): CurrencySum[][] {
  return Array.from({ length: 12 }, (_, m) => {
    const { from, to } = monthRange(year, m);
    return sumByCurrency(rows, from, to);
  });
}
