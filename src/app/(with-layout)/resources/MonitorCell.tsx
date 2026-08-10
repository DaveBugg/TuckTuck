"use client";

// Ячейка мониторинга в списке ресурсов.
//
// Наведение — короткая сводка, клик — попап с подробностями и управлением
// агентом. Данные грузятся ТОЛЬКО при первом наведении: в таблице на сто строк
// сотня запросов при отрисовке никому не нужна, а большинство строк никто не
// трогает.

import React, { useCallback, useRef, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/client-api";
import { SystemSummary, type SystemView } from "@/components/monitoring/metrics";
import { useI18n } from "@/components/i18n-provider";
import type { ResourceRow } from "./types";

export default function MonitorCell({
  row,
  onOpen,
}: {
  row: ResourceRow;
  onOpen: (row: ResourceRow) => void;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<SystemView | null>(null);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);

  const load = useCallback(() => {
    if (loadedRef.current || loading) return;
    loadedRef.current = true;
    setLoading(true);
    apiFetch(`/api/monitoring/${row.id}`)
      .then(d => setData(d.system))
      .catch(() => {
        // Не смогли — дадим попробовать снова при следующем наведении.
        loadedRef.current = false;
      })
      .finally(() => setLoading(false));
  }, [row.id, loading]);

  // Сервер самой панели мониторится изнутри, без агента и без токена, поэтому
  // проверять только agentConnected нельзя: у него метрики есть, а иконки не
  // было — ровно то, что видно в списке ресурсов.
  const monitored = row.agentConnected || row.isSelf;

  // Ни агента, ни внутреннего снятия — показывать нечего, и наводить не на что.
  if (!monitored) {
    return (
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        {t("monitor.connect")}
      </button>
    );
  }

  const dot =
    data?.health === "up"
      ? "bg-success"
      : data?.health === "stale"
        ? "bg-warning"
        : data?.health === "down"
          ? "bg-destructive"
          : "bg-muted-foreground/40";

  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onMouseEnter={load}
          onFocus={load}
          onClick={() => onOpen(row)}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-accent"
          aria-label={t("monitor.aria", { name: row.name })}
        >
          <Activity className="size-4 text-primary" />
          <span className={cn("size-1.5 rounded-full", dot)} />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("monitor.loading")}
          </div>
        )}
        {!loading && data && <SystemSummary s={data} compact />}
        {!loading && !data && (
          <div className="text-sm text-muted-foreground">{t("monitor.unavailable")}</div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
