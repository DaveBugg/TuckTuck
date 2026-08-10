"use client";

// Расход за месяц: точные суммы по валютам и общий итог в выбранной.
//
// Суммы по валютам стоят ПЕРВЫМИ и крупнее, а общий итог идёт подписью. Это не
// вкусовщина: по валютам числа точные и не меняются между заходами, а итог
// зависит от курса, который берётся у третьих лиц и живёт час. Поставить его
// главным значило бы выдать оценку за факт.

import React, { useCallback, useEffect, useState } from "react";
import { Wallet, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";

type Totals = {
  displayCurrency: string;
  total: number;
  totalReliable: boolean;
  unconverted: string[];
  ratesAt: string;
  byCurrency: Array<{ currency: string; isCrypto: boolean; count: number; amount: number }>;
};

export default function SpendCard() {
  const { t, fmtNum, fmtDateTime } = useI18n();
  const [d, setD] = useState<Totals | null>(null);

  /** Крипте нужны знаки: 0.0004 BTC при округлении до копеек стало бы нулём. */
  const fmt = (v: number, crypto: boolean) =>
    crypto
      ? fmtNum(v, { maximumFractionDigits: 8 })
      : fmtNum(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const load = useCallback(() => {
    apiFetch("/api/resources/totals")
      .then(setD)
      .catch(() => setD(null));
  }, []);
  useEffect(load, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4 text-muted-foreground" />
          {t("spend.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!d && <Skeleton className="h-16 w-full" />}

        {d && d.byCurrency.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("spend.empty")}</p>
        )}

        {d && d.byCurrency.length > 0 && (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {d.byCurrency.map(c => (
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

            {d.byCurrency.length > 1 && (
              <div className="border-t pt-3">
                {d.totalReliable ? (
                  <div className="text-sm">
                    <span className="text-muted-foreground">{t("spend.total")} </span>
                    <span className="tabular font-semibold">
                      {fmt(d.total, false)} {d.displayCurrency}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      · {t("spend.ratesAt", { at: fmtDateTime(d.ratesAt) })}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                    <span>
                      {t("spend.noRateFor")}{" "}
                      {d.unconverted.map(c => (
                        <Badge key={c} variant="outline" className="mx-0.5">
                          {c}
                        </Badge>
                      ))}
                      . {t("spend.exactAbove")}
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
