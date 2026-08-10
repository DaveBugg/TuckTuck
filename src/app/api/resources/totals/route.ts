import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { visibilityWhere } from "@/lib/resources";
import { getSettings } from "@/lib/settings";
import { getRates, convert } from "@/lib/rates";

/** Месячная стоимость ресурса в его валюте. */
function perMonth(amount: number, value: number, unit: string): number {
  const v = Math.max(1, value);
  switch (unit) {
    case "DAY":
      return (amount / v) * 30;
    case "WEEK":
      return (amount / v) * (30 / 7);
    case "YEAR":
      return amount / (v * 12);
    default:
      return amount / v; // MONTH
  }
}

/**
 * Расход за месяц: по каждой валюте отдельно и одной суммой в выбранной.
 *
 * Раздельно по валютам — потому что это единственные ТОЧНЫЕ числа: они не
 * зависят от курса и не меняются между заходами. Общий итог считается по курсу
 * и потому помечается отдельно; если курса какой-то валюты нет, она попадает в
 * список непересчитанных, а не молча выпадает из суммы.
 */
export async function GET() {
  try {
    const me = await requirePermission("resources.view");
    const { displayCurrency } = await getSettings();

    const rows = await prisma.resource.findMany({
      where: { ...visibilityWhere(me), isActive: true },
      select: { amount: true, currency: true, isCrypto: true, periodValue: true, periodUnit: true },
    });

    const byCurrency = new Map<string, { amount: number; isCrypto: boolean; count: number }>();
    for (const r of rows) {
      const m = perMonth(Number(r.amount), r.periodValue, r.periodUnit);
      const cur = r.currency.toUpperCase();
      const acc = byCurrency.get(cur) ?? { amount: 0, isCrypto: r.isCrypto, count: 0 };
      acc.amount += m;
      acc.count += 1;
      byCurrency.set(cur, acc);
    }

    const rates = await getRates();
    let total = 0;
    const unconverted: string[] = [];
    for (const [cur, v] of byCurrency) {
      const c = convert(v.amount, cur, displayCurrency, rates.perUsd);
      if (c == null) unconverted.push(cur);
      else total += c;
    }

    return NextResponse.json({
      displayCurrency,
      total: byCurrency.size ? Math.round(total * 100) / 100 : 0,
      // Курс не получен ни для чего — сумма была бы нулём, и показывать её как
      // «расходов нет» нельзя.
      totalReliable: unconverted.length === 0 && rates.sources.length > 0,
      unconverted,
      ratesAt: rates.fetchedAt,
      byCurrency: [...byCurrency.entries()]
        .map(([currency, v]) => ({
          currency,
          isCrypto: v.isCrypto,
          count: v.count,
          // Крипте нужны знаки после запятой: 0.0004 BTC при округлении до
          // копеек превратилось бы в ноль.
          amount: v.isCrypto ? Math.round(v.amount * 1e8) / 1e8 : Math.round(v.amount * 100) / 100,
        }))
        .sort((a, b) => a.currency.localeCompare(b.currency)),
    });
  } catch (e) {
    return toApiError(e);
  }
}
