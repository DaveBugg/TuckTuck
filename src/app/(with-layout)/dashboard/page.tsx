"use client";

// Дашборд: ближайшие оплаты слева, здоровье серверов справа.

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/client-api";
import { useCurrentUser, usePermissions } from "@/lib/use-permissions";
import { kindLabel, daysUntil, dueLevel } from "@/lib/resources";
import { useI18n } from "@/components/i18n-provider";
import type { TFunc } from "@/lib/i18n/translate";
import MonitoringCard from "./MonitoringCard";
import SpendCard from "./SpendCard";
import type { ResourceRow } from "../resources/types";

const DUE_VARIANT = {
  overdue: "destructive",
  d3: "destructive",
  d7: "warning",
  d14: "info",
  later: "muted",
} as const;

const asDate = (ymd: string) => new Date(ymd + "T00:00:00Z");

function dueText(days: number, t: TFunc) {
  if (days === 0) return t("due.today");
  if (days === 1) return t("due.tomorrow");
  // count передаём положительным: правила множественного числа считают по
  // величине, а «просрочено на −3 дня» получилось бы не в той форме.
  if (days < 0) return t("due.overdue", { count: -days });
  return t("due.in", { count: days });
}

export default function DashboardPage() {
  const me = useCurrentUser();
  const { can } = usePermissions();
  const { t, fmtNum } = useI18n();
  const [rows, setRows] = useState<ResourceRow[] | null>(null);

  // Зависимость — БУЛЕВО право, а не функция can: даже стабильная функция
  // меняется при смене роли, а список надо перезапрашивать только когда
  // доступ реально появился или пропал.
  const mayView = can("resources.view");

  useEffect(() => {
    if (!mayView) return;
    // Только ближайшие: список уже отсортирован сервером по дате оплаты.
    apiFetch("/api/resources?pageSize=6")
      .then(d => setRows(d.rows))
      .catch(() => setRows([]));
  }, [mayView]);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {me?.name ? t("dashboard.helloName", { name: me.name }) : t("dashboard.hello")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </div>

      {can("resources.view") && <SpendCard />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("dashboard.upcoming")}</CardTitle>
            {can("resources.view") && (
              <Link
                href="/resources"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                {t("dashboard.allResources")} <ArrowRight className="size-3.5" />
              </Link>
            )}
          </CardHeader>
          <CardContent>
            {!can("resources.view") && (
              <p className="text-sm text-muted-foreground">{t("dashboard.noAccess")}</p>
            )}
            {can("resources.view") && rows === null && (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            )}
            {rows?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("dashboard.emptyResources")}{" "}
                <Link href="/resources" className="text-primary hover:underline">
                  {t("dashboard.addFirst")}
                </Link>
              </p>
            )}
            {rows && rows.length > 0 && (
              <ul className="flex flex-col divide-y">
                {rows.map(r => {
                  const d = daysUntil(asDate(r.nextPaymentAt));
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{kindLabel(r.kind, t)}</div>
                      </div>
                      <div className="tabular text-sm">
                        {fmtNum(Number(r.amount), { minimumFractionDigits: 2 })} {r.currency}
                      </div>
                      <Badge variant={DUE_VARIANT[dueLevel(d)]}>{dueText(d, t)}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <MonitoringCard />
      </div>
    </div>
  );
}
