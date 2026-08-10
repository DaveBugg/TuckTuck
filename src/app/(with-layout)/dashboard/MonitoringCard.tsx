"use client";

// Здоровье серверов на дашборде. Данные шлют агенты (scripts/agent.sh),
// панель их только показывает.
//
// Виджет намеренно «мягкий»: отсутствие агентов и молчащая машина — это
// понятные состояния, а не сломанная страница. Мониторинг стоит рядом с
// оплатами и не должен ронять главный экран.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, RefreshCw, ArrowRight, ServerCog, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { apiFetch, apiJson } from "@/lib/client-api";
import { type Health } from "@/lib/monitoring";
import { SystemSummary, type SystemView } from "@/components/monitoring/metrics";
import { useI18n } from "@/components/i18n-provider";

type System = SystemView;

export default function MonitoringCard() {
  const { t, fmtTime } = useI18n();
  const [systems, setSystems] = useState<System[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [search, setSearch] = useState("");

  // Крутим кнопку и на автоматическом обновлении тоже: иначе список меняется
  // сам по себе, и непонятно, это свежие данные или страница подвисла.
  const load = useCallback(() => {
    setBusy(true);
    apiFetch("/api/monitoring")
      .then(d => {
        setSystems(d.systems);
        setUpdatedAt(new Date());
      })
      .catch(() => setSystems([]))
      // Задержка не для красоты: без неё при быстром ответе кнопка мигает на
      // один кадр, и «обновилось» глазом не читается.
      .finally(() => setTimeout(() => setBusy(false), 400));
  }, []);

  useEffect(() => {
    load();
    // Агенты шлют раз в минуту — чаще опрашивать нечего.
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const bad = systems?.filter(s => s.health === "down" || s.health === "stale").length ?? 0;
  const hasSelf = systems?.some(s => s.isSelf) ?? false;

  // Поиск на клиенте: машин десятки, а не тысячи, и ходить за этим на сервер
  // значит ждать ответа на каждую букву.
  const connected = useMemo(() => {
    const all = systems?.filter(s => s.agentConnected) ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(s => s.name.toLowerCase().includes(q) || (s.ip || "").includes(q));
  }, [systems, search]);

  const anyConnected = (systems?.filter(s => s.agentConnected).length ?? 0) > 0;

  const enableSelf = async () => {
    try {
      const d = await apiJson("/api/monitoring/self/enable", "POST");
      toast.success(d.already ? t("monitor.selfAlready") : t("monitor.selfAdded", { name: d.row.name }));
      load();
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
        <div className="flex items-center gap-1.5">
          {updatedAt && (
            <span className="text-xs text-muted-foreground">
              {t("monitor.updatedAt", { time: fmtTime(updatedAt) })}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={load}
            aria-label={t("common.refresh")}
            disabled={busy}
          >
            <RefreshCw className={cn(busy && "animate-spin")} />
          </Button>
        </div>
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

        {systems && systems.length > 0 && !anyConnected && (
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

        {anyConnected && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("monitor.searchPlaceholder")}
              aria-label={t("monitor.searchPlaceholder")}
            />
          </div>
        )}

        {anyConnected && connected.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("dashboard.nothingFound")}</p>
        )}

        {/* Прокрутка внутри карточки, а не рост карточки вниз: с десятком машин
            виджет уезжал за экран, и до ссылки под ним никто не добирался. */}
        {/* pr-1 — зазор между полосой прокрутки и содержимым: без него ползунок
            встаёт вплотную к процентам справа и читается как часть цифры. */}
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
          {connected.map(s => (
            <div key={s.id} className="border-b pb-4 last:border-0 last:pb-0">
              <SystemSummary s={s} />
            </div>
          ))}
        </div>

        {anyConnected && (
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
