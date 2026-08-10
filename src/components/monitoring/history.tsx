"use client";

// История метрик: переключатель периода, средние и распределение нагрузки по
// часам суток.
//
// График рисуется обычными div'ами. Библиотека графиков ради двадцати четырёх
// столбиков притащила бы в бандл сотни килобайт и свою тему, которую пришлось
// бы согласовывать с нашей — а здесь достаточно ширины и цвета.

import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/client-api";
import { metricLevel } from "@/lib/monitoring";
import { useI18n } from "@/components/i18n-provider";

const PERIODS = [1, 7, 14, 30] as const;
type Days = (typeof PERIODS)[number];

type History = {
  days: Days;
  timezone: string;
  summary: { cpu: number | null; memory: number | null; disk: number | null; load1: number | null; samples: number };
  byHour: Array<{ hour: number; cpu: number | null; samples: number }>;
  peakHour: number | null;
};

const BAR = { ok: "bg-primary", warn: "bg-warning", crit: "bg-destructive", none: "bg-muted" };

function Stat({ label, value, suffix = "%" }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="tabular text-lg font-semibold">
        {value == null ? "—" : `${value}${suffix}`}
      </span>
    </div>
  );
}

export default function MetricsHistory({ resourceId }: { resourceId: string }) {
  const { t } = useI18n();
  const [days, setDays] = useState<Days>(7);
  const [data, setData] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    (d: Days) => {
      setLoading(true);
      apiFetch(`/api/monitoring/${resourceId}/history?days=${d}`)
        .then(setData)
        .catch(() => setData(null))
        .finally(() => setLoading(false));
    },
    [resourceId]
  );

  useEffect(() => load(days), [load, days]);

  const hasHourly = data?.byHour.some(b => b.cpu != null) ?? false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIODS.map(d => (
          <Button
            key={d}
            size="sm"
            variant={days === d ? "default" : "outline"}
            onClick={() => setDays(d)}
          >
            {d === 1 ? t("history.day") : t("history.days", { count: d })}
          </Button>
        ))}
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {data && data.summary.samples === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("history.noData")}
        </p>
      )}

      {data && data.summary.samples > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("history.cpuAvg")} value={data.summary.cpu} />
            <Stat label={t("metric.memory")} value={data.summary.memory} />
            <Stat label={t("metric.disk")} value={data.summary.disk} />
            <Stat label="Load" value={data.summary.load1} suffix="" />
          </div>

          {hasHourly && (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">{t("history.byHour")}</span>
                <span className="text-xs text-muted-foreground">
                  {data.peakHour != null
                    ? t("history.peak", { hour: String(data.peakHour).padStart(2, "0") })
                    : ""}{" "}
                  · {data.timezone}
                </span>
              </div>

              {/* Столбики фиксированной высоты: сравнивать надо часы между
                  собой, а не с абсолютным потолком в 100%. */}
              <div className="flex h-24 items-end gap-[2px]">
                {data.byHour.map(b => {
                  const h = b.cpu == null ? 0 : Math.max(2, b.cpu);
                  const level = metricLevel(b.cpu);
                  return (
                    <div
                      key={b.hour}
                      className="group relative flex-1"
                      title={
                        b.cpu == null
                          ? t("history.hourNoData", { hour: String(b.hour).padStart(2, "0") })
                          : t("history.hourValue", {
                              hour: String(b.hour).padStart(2, "0"),
                              value: b.cpu,
                            })
                      }
                    >
                      <div
                        className={cn(
                          "w-full rounded-sm transition-all",
                          b.cpu == null ? "bg-muted" : BAR[level],
                          data.peakHour === b.hour && "ring-1 ring-foreground/30"
                        )}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Подписи только у каждого шестого часа: двадцать четыре числа
                  в строку не читаются ни на каком экране. */}
              <div className="flex gap-[2px] text-[10px] text-muted-foreground">
                {data.byHour.map(b => (
                  <div key={b.hour} className="flex-1 text-center">
                    {b.hour % 6 === 0 ? String(b.hour).padStart(2, "0") : ""}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
