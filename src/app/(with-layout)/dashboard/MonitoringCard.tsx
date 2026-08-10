"use client";

// Здоровье серверов на дашборде. Данные шлют агенты (scripts/agent.sh),
// панель их только показывает.
//
// Виджет намеренно «мягкий»: отсутствие агентов и молчащая машина — это
// понятные состояния, а не сломанная страница. Мониторинг стоит рядом с
// оплатами и не должен ронять главный экран.

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, RefreshCw, ArrowRight, ServerCog } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { apiFetch, apiJson } from "@/lib/client-api";
import { type Health } from "@/lib/monitoring";
import { SystemSummary, type SystemView } from "@/components/monitoring/metrics";
import { useI18n } from "@/components/i18n-provider";

type System = SystemView;

export default function MonitoringCard() {
  const { t } = useI18n();
  const [systems, setSystems] = useState<System[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback((manual = false) => {
    if (manual) setBusy(true);
    apiFetch("/api/monitoring")
      .then(d => setSystems(d.systems))
      .catch(() => setSystems([]))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    load();
    // Агенты шлют раз в минуту — чаще опрашивать нечего.
    const t = setInterval(() => load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const bad = systems?.filter(s => s.health === "down" || s.health === "stale").length ?? 0;
  const connected = systems?.filter(s => s.agentConnected) ?? [];
  const hasSelf = systems?.some(s => s.isSelf) ?? false;

  const enableSelf = async () => {
    try {
      const d = await apiJson("/api/monitoring/self/enable", "POST");
      toast.success(d.already ? t("monitor.selfAlready") : t("monitor.selfAdded", { name: d.row.name }));
      load(true);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          {t("monitor.servers")}
          {bad > 0 && <Badge variant="destructive">{bad}</Badge>}
        </CardTitle>
        <Button variant="ghost" size="icon-sm" onClick={() => load(true)} aria-label={t("common.refresh")} disabled={busy}>
          <RefreshCw className={cn(busy && "animate-spin")} />
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {systems === null &&
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}

        {systems?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("monitor.noServers")}{" "}
            <Link href="/resources" className="text-primary hover:underline">
              {t("common.add")}
            </Link>
          </p>
        )}

        {/* Сервер панели мониторится без агента и без ssh: метрики снимаются
            изнутри контейнера с примонтированного хостового /proc. */}
        {systems !== null && !hasSelf && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2">
            <div className="text-xs text-muted-foreground">
              {t("monitor.selfHint")}
            </div>
            <Button variant="outline" size="sm" onClick={enableSelf}>
              <ServerCog />
              {t("common.enable")}
            </Button>
          </div>
        )}

        {systems && systems.length > 0 && connected.length === 0 && (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>{t("monitor.noAgents")}</p>
            <p className="text-xs">
              {t("monitor.noAgentsHintBefore")}{" "}
              <Link href="/resources" className="text-primary hover:underline">
                {t("nav.resources")}
              </Link>{" "}
              {t("monitor.noAgentsHintAfter")}
            </p>
          </div>
        )}

        {connected.map(s => (
          <div key={s.id} className="border-b pb-4 last:border-0 last:pb-0">
            <SystemSummary s={s} />
          </div>
        ))}

        {connected.length > 0 && (
          <Link
            href="/resources"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {t("dashboard.allResources")} <ArrowRight className="size-3.5" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
