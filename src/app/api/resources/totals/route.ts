import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { visibilityWhere, CRYPTO_CURRENCIES } from "@/lib/resources";
import { getSettings } from "@/lib/settings";
import { getRates, convert } from "@/lib/rates";
import { byMonth, monthRange, sumByCurrency, type CurrencySum } from "@/lib/spend";

/**
 * Расход по календарным периодам: этот месяц, следующий и год целиком.
 *
 * Считаются настоящие платежи, а не усреднение. Усреднение показывало ровную
 * цифру круглый год, и в месяц с годовым счётом она врала сильнее всего —
 * именно тогда, когда цифра нужна. Разворачивание расписания заодно даёт
 * годовую динамику, по которой видно кварталы и годовые подписки.
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

    const dbRows = await prisma.resource.findMany({
      where: { ...visibilityWhere(me), isActive: true },
      select: {
        amount: true,
        currency: true,
        isCrypto: true,
        periodValue: true,
        periodUnit: true,
        nextPaymentAt: true,
      },
    });

    // Decimal у Prisma не число: приводим к строке, а не к float — точность
    // суммы важнее удобства, и spend.ts принимает строку намеренно.
    const rows = dbRows.map(r => ({ ...r, amount: r.amount.toString() }));

    const rates = await getRates();
    const displayIsCrypto = (CRYPTO_CURRENCIES as readonly string[]).includes(displayCurrency);
    // Итог округляем по валюте, в которой его показываем: 14 долларов в
    // пересчёте — это 0.00015 BTC, и округление до сотых дало бы ноль.
    const step = displayIsCrypto ? 1e8 : 100;

    /** Свести суммы по валютам в одну по курсу. */
    const convertAll = (sums: CurrencySum[]) => {
      let total = 0;
      const unconverted: string[] = [];
      for (const c of sums) {
        const v = convert(c.amount, c.currency, displayCurrency, rates.perUsd);
        if (v == null) unconverted.push(c.currency);
        else total += v;
      }
      return {
        total: sums.length ? Math.round(total * step) / step : 0,
        totalReliable: unconverted.length === 0 && rates.sources.length > 0,
        unconverted,
      };
    };

    const now = new Date();
    const year = now.getUTCFullYear();
    const m = now.getUTCMonth();

    const cur = monthRange(year, m);
    // monthRange принимает индекс месяца и сам переносит декабрь на январь
    // следующего года — отдельная ветка для декабря не нужна.
    const nxt = monthRange(year, m + 1);
    const yearRange = {
      from: new Date(Date.UTC(year, 0, 1)),
      to: new Date(Date.UTC(year + 1, 0, 1)),
    };

    const monthSums = sumByCurrency(rows, cur.from, cur.to);
    const nextSums = sumByCurrency(rows, nxt.from, nxt.to);
    const yearSums = sumByCurrency(rows, yearRange.from, yearRange.to);

    // Двенадцать месяцев для всплывающего окна: и точные суммы по валютам, и
    // пересчитанный итог — по нему строится столбик.
    const months = byMonth(rows, year).map((sums, i) => ({
      month: i,
      byCurrency: sums,
      ...convertAll(sums),
    }));

    return NextResponse.json({
      displayCurrency,
      displayIsCrypto,
      year,
      month: { index: m, byCurrency: monthSums, ...convertAll(monthSums) },
      nextMonth: { index: (m + 1) % 12, byCurrency: nextSums, ...convertAll(nextSums) },
      yearTotal: { byCurrency: yearSums, ...convertAll(yearSums) },
      months,
      ratesAt: rates.fetchedAt,
    });
  } catch (e) {
    return toApiError(e);
  }
}
