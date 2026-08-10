"use client";

// Общие кирпичики мониторинга: полоса метрики, бейдж состояния, сводка по
// ресурсу. Один набор на дашборд, список ресурсов и попап карточки — иначе три
// одинаковых виджета разъезжаются на первой же правке.

import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { healthLabel, agoText, metricLevel, uptimeText, type Health } from "@/lib/monitoring";
import { useI18n } from "@/components/i18n-provider";

export type SystemView = {
  id: string;
  name: string;
  kind: string;
  ip: string;
  agentConnected: boolean;
  isSelf: boolean;
  health: Health;
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  load1: number | null;
  uptimeSec: number | null;
  lastSeen: string | null;
};

export const HEALTH_VARIANT: Record<Health, "success" | "warning" | "destructive" | "muted"> = {
  up: "success",
  stale: "warning",
  down: "destructive",
  unknown: "muted",
};

const BAR = { ok: "bg-primary", warn: "bg-warning", crit: "bg-destructive", none: "bg-muted" };

export function Meter({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: number | null;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const level = metricLevel(value);
  return (
    <div className="flex flex-col gap-1">
      <div className={cn("flex items-center justify-between", compact ? "text-[11px]" : "text-xs")}>
        <span className="text-muted-foreground">{label}</span>
        {/* Процент подписан цифрой, а не только цветом: одним цветом это
            нечитаемо при дальтонизме и на чёрно-белом экране. */}
        {/* Не прочерк: у CPU первое значение появляется только со второго
            замера агента, и прочерк там читается как «нет данных и не будет».
            «Ожидаем» говорит, что происходит на самом деле. */}
        {value == null ? (
          <span className="text-muted-foreground">{t("metric.waiting")}</span>
        ) : (
          <span className="tabular font-medium">{`${Math.round(value)}%`}</span>
        )}
      </div>
      <div className={cn("w-full overflow-hidden rounded-full bg-muted", compact ? "h-1" : "h-1.5")}>
        {value != null && (
          <div
            className={cn("h-full rounded-full transition-all", BAR[level])}
            style={{ width: `${value}%` }}
          />
        )}
      </div>
    </div>
  );
}

export function HealthBadge({ health }: { health: Health }) {
  const { t } = useI18n();
  return <Badge variant={HEALTH_VARIANT[health]}>{healthLabel(health, t)}</Badge>;
}

/**
 * Сводка по одной машине: имя, состояние, три полосы.
 *
 * У молчащей машины метрики НЕ показываются: они устарели, а «5% CPU» у
 * упавшего сервера читается как «всё хорошо».
 */
export function SystemSummary({ s, compact = false }: { s: SystemView; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn("truncate font-medium", compact ? "text-xs" : "text-sm")}>
              {s.name}
            </span>
            {s.isSelf && <Badge variant="secondary">{t("monitor.thisPanel")}</Badge>}
          </div>
          <div className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
            {s.health === "up" && s.uptimeSec != null
              ? t("monitor.uptime", { value: uptimeText(s.uptimeSec, t) })
              : agoText(s.lastSeen ? new Date(s.lastSeen) : null, t)}
          </div>
        </div>
        <HealthBadge health={s.health} />
      </div>

      {s.health === "up" && (
        <div className="flex flex-col gap-2">
          <Meter label="CPU" value={s.cpu} compact={compact} />
          <Meter label={t("metric.memory")} value={s.memory} compact={compact} />
          <Meter label={t("metric.disk")} value={s.disk} compact={compact} />
          {s.load1 != null && (
            <div className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
              load {s.load1.toFixed(2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
