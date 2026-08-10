"use client";

// Ячейка мониторинга в списке ресурсов.
//
// Цвет значка — худшее из состояний машины: оранжевый, если что-то нагружено,
// красный, если критично или она молчит. Смысл в том, чтобы беду было видно, не
// наводя мышь на каждую строку.
//
// Поэтому метрики приходят СВЕРХУ, одним запросом на всю таблицу, а не по
// одному на строку при наведении. Раньше грузилось по наведению — иначе сотня
// строк давала сотню запросов; но тогда до наведения цвет был неизвестен, а
// именно он и нужен с первого взгляда. Один запрос на страницу решает обе
// задачи сразу.

import React from "react";
import { Activity } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { worstLevel } from "@/lib/monitoring";
import { SystemSummary, type SystemView } from "@/components/monitoring/metrics";
import { useI18n } from "@/components/i18n-provider";
import type { ResourceRow } from "./types";

/** Цвет значка по худшему показателю. Серый — данных ещё нет. */
const ICON_COLOR = {
  ok: "text-primary",
  warn: "text-warning",
  crit: "text-destructive",
  none: "text-muted-foreground",
} as const;

const DOT_COLOR = {
  up: "bg-success",
  stale: "bg-warning",
  down: "bg-destructive",
  unknown: "bg-muted-foreground/40",
} as const;

export default function MonitorCell({
  row,
  system,
  onOpen,
}: {
  row: ResourceRow;
  /** Метрики машины из общего запроса страницы. undefined — ещё грузятся. */
  system?: SystemView;
  onOpen: (row: ResourceRow) => void;
}) {
  const { t } = useI18n();

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

  const level = system ? worstLevel(system) : "none";

  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={() => onOpen(row)}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-accent"
          aria-label={t("monitor.aria", { name: row.name })}
        >
          <Activity className={cn("size-4", ICON_COLOR[level])} />
          <span
            className={cn("size-1.5 rounded-full", DOT_COLOR[system?.health ?? "unknown"])}
          />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72">
        {system ? (
          <SystemSummary s={system} compact />
        ) : (
          <div className="text-sm text-muted-foreground">{t("monitor.unavailable")}</div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
