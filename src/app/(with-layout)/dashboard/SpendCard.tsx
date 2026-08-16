"use client";

// Расход: слева этот месяц, справа год.
//
// Считается по НАСТОЯЩИМ платежам, а не усреднением. «Сколько уйдёт в этом
// месяце» — вопрос про календарь: годовая подписка не отдаёт по одной
// двенадцатой каждый месяц, она приходит один раз целиком.
//
// Суммы по валютам стоят ПЕРВЫМИ и крупнее, а общий итог идёт подписью. Это не
// вкусовщина: по валютам числа точные и не меняются между заходами, а итог
// зависит от курса, который берётся у третьих лиц и живёт час. Поставить его
// главным значило бы выдать оценку за факт.

import React, { useCallback, useEffect, useState } from "react";
import { Wallet, AlertTriangle, ChartColumn } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";

type Sum = { currency: string; isCrypto: boolean; count: number; amount: number };
type Period = {
  index?: number;
  byCurrency: Sum[];
  total: number;
  totalReliable: boolean;
  unconverted: string[];
};
type Totals = {
  displayCurrency: string;
  displayIsCrypto: boolean;
  year: number;
  month: Period;
  nextMonth: Period;
  yearTotal: Period;
  months: Array<Period & { month: number }>;
  ratesAt: string;
};

export default function SpendCard({ reloadKey = 0 }: { reloadKey?: number }) {
  const { t, fmtNum, fmtDateTime, locale } = useI18n();
  const [d, setD] = useState<Totals | null>(null);

  // reloadKey приходит снаружи: отметка оплаты в соседнем списке меняет суммы
  // здесь, и оставить их прежними значило бы показать устаревшие цифры.
  const load = useCallback(() => {
    apiFetch("/api/resources/totals")
      .then(setD)
      .catch(() => setD(null));
  }, []);
  useEffect(load, [load, reloadKey]);

  /** Крипте нужны знаки: 0.0004 BTC при округлении до копеек стало бы нулём. */
  const fmt = (v: number, crypto: boolean) =>
    crypto
      ? fmtNum(v, { maximumFractionDigits: 8 })
      : fmtNum(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Названия месяцев берём у движка, а не списком в словаре: их двенадцать на
  // язык, и Intl уже знает и формы, и сокращения.
  const monthName = (i: number, short = false) =>
    new Date(Date.UTC(2000, i, 1)).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", {
      month: short ? "short" : "long",
    });

  /**
   * Нужен ли пересчитанный итог.
   *
   * Не нужен ровно в одном случае: валюта одна и она же выбрана для итога —
   * тогда это то же число второй раз. Во всех остальных, включая одну валюту,
   * отличную от выбранной, он нужен: «7 858,88 RUB» не отвечает на вопрос
   * «сколько это в долларах», ради которого настройку и заводили.
   */
  const showTotal = (p: Period) =>
    p.byCurrency.length > 1 ||
    (p.byCurrency.length === 1 && p.byCurrency[0].currency !== d?.displayCurrency);

  /** Точные суммы одной строкой: «7 858,88 RUB + 12,00 EUR». */
  const exactLine = (p: Period) =>
    p.byCurrency.map(c => `${fmt(c.amount, c.isCrypto)} ${c.currency}`).join(" + ");

  /** Колонка периода: точные суммы по валютам плюс подпись с общим итогом. */
  const Column = ({
    title,
    p,
    extra,
  }: {
    title: React.ReactNode;
    p: Period;
    extra?: React.ReactNode;
  }) => (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">{title}</div>

      {p.byCurrency.length === 0 && (
        <span className="text-sm text-muted-foreground">{t("spend.none")}</span>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {p.byCurrency.map(c => (
          <div key={c.currency} className="flex flex-col">
            <span className="tabular text-lg font-semibold">
              {fmt(c.amount, c.isCrypto)} {c.currency}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("spend.count", { count: c.count })}
              {c.isCrypto && ` · ${t("spend.crypto")}`}
            </span>
          </div>
        ))}
      </div>

      {showTotal(p) && (
        <div className="text-sm">
          {p.totalReliable ? (
            <>
              <span className="text-muted-foreground">{t("spend.total")} </span>
              <span className="tabular font-semibold">
                {d && fmt(p.total, d.displayIsCrypto)} {d?.displayCurrency}
              </span>
            </>
          ) : (
            <span className="flex items-start gap-1.5 text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>
                {t("spend.noRateFor")}{" "}
                {p.unconverted.map(c => (
                  <Badge key={c} variant="outline" className="mx-0.5">
                    {c}
                  </Badge>
                ))}
              </span>
            </span>
          )}
        </div>
      )}

      {extra}
    </div>
  );

  const maxMonth = d ? Math.max(...d.months.map(m => m.total), 0) : 0;

  return (
    <Card>
      <CardContent className="pt-5">
        {!d && <Skeleton className="h-24 w-full" />}

        {d && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <div className="md:col-span-6">
              <Column
                title={
                  <>
                    <Wallet className="size-4" />
                    {t("spend.thisMonth", { month: monthName(d.month.index ?? 0) })}
                  </>
                }
                p={d.month}
                extra={
                  // Следующий месяц — мелким текстом: это ещё не расход, а
                  // предупреждение, что в нём соберётся другая сумма.
                  d.nextMonth.byCurrency.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("spend.nextMonth", {
                        month: monthName(d.nextMonth.index ?? 0),
                        amount:
                          exactLine(d.nextMonth) +
                          // Пересчёт добавляем той же подписью, что и в колонках:
                          // следующий месяц читают тем же взглядом, что текущий.
                          (showTotal(d.nextMonth) && d.nextMonth.totalReliable
                            ? ` ≈ ${fmt(d.nextMonth.total, d.displayIsCrypto)} ${d.displayCurrency}`
                            : ""),
                      })}
                    </p>
                  ) : null
                }
              />
            </div>

            <div className="md:col-span-6 md:border-l md:pl-6">
              <Column
                title={
                  <>
                    <Wallet className="size-4" />
                    {t("spend.year", { year: d.year })}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="ml-auto"
                          aria-label={t("spend.byMonths")}
                          title={t("spend.byMonths")}
                        >
                          <ChartColumn />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-88 p-3">
                        <div className="mb-2 text-sm font-medium">
                          {t("spend.byMonthsTitle", { year: d.year })}
                        </div>
                        <div className="flex flex-col gap-1">
                          {d.months.map(m => (
                            <div key={m.month} className="flex items-center gap-2 text-xs">
                              <span className="w-9 shrink-0 text-muted-foreground">
                                {monthName(m.month, true)}
                              </span>
                              {/* Столбик рисуется делением: ради двенадцати
                                  чисел тянуть библиотеку графиков незачем. */}
                              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                <span
                                  className={cn(
                                    "block h-full rounded-full",
                                    m.month === d.month.index ? "bg-primary" : "bg-primary/45"
                                  )}
                                  style={{
                                    width: maxMonth > 0 ? `${(m.total / maxMonth) * 100}%` : "0%",
                                  }}
                                />
                              </span>
                              <span className="tabular w-24 shrink-0 text-right">
                                {m.byCurrency.length === 0
                                  ? "—"
                                  : `${fmt(m.total, d.displayIsCrypto)} ${d.displayCurrency}`}
                              </span>
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t("spend.byMonthsHint")}
                        </p>
                      </PopoverContent>
                    </Popover>
                  </>
                }
                p={d.yearTotal}
              />
            </div>
          </div>
        )}

        {d && (d.month.byCurrency.length > 1 || d.yearTotal.byCurrency.length > 1) && (
          <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
            {t("spend.ratesAt", { at: fmtDateTime(d.ratesAt) })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
