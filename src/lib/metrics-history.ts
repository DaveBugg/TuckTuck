// История метрик: средние за период и распределение нагрузки по часам суток.
//
// Читает из ДВУХ источников сразу — сырых минутных точек (последние сутки) и
// свёрнутых часовых/суточных. Иначе после свёртки график за вчера обрывался бы,
// а за сегодня строился только по сырым.

import { prisma } from "./prisma";
import { safeTimezone } from "./timezone";

export const PERIODS = [1, 7, 14, 30] as const;
export type PeriodDays = (typeof PERIODS)[number];

export type PeriodSummary = {
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  load1: number | null;
  samples: number;
};

/** Средняя нагрузка в конкретный час суток: 0..23 в местном времени. */
export type HourBucket = { hour: number; cpu: number | null; samples: number };

export type HistoryResult = {
  days: PeriodDays;
  timezone: string;
  summary: PeriodSummary;
  byHour: HourBucket[];
  /** Пиковый час — тот, где средний CPU максимален. null, если данных нет. */
  peakHour: number | null;
};

const round = (v: unknown): number | null => {
  const n = Number(v);
  return isFinite(n) ? Math.round(n * 10) / 10 : null;
};

/**
 * Средние за период и разрез по часам суток.
 *
 * Взвешиваем по числу точек: у свёрнутых строк в поле samples лежит, сколько
 * минутных замеров в них попало, и считать час из шестидесяти точек равным
 * часу из трёх — значит завысить вклад того, где сервер почти молчал. У сырых
 * точек вес единица.
 *
 * Час берётся в МЕСТНОМ времени: вопрос «когда сервер нагружен» имеет смысл
 * только так. Пояс подставляется в SQL литералом, поэтому проходит через
 * safeTimezone — см. комментарий в lib/timezone.
 */
export async function metricsHistory(
  resourceId: string,
  days: PeriodDays,
  timezone: string
): Promise<HistoryResult> {
  const tz = safeTimezone(timezone) ?? "UTC";
  const since = new Date(Date.now() - days * 86400_000);

  // Один запрос на оба источника: UNION ALL приводит их к общему виду
  // (значение, вес, момент), дальше группируем уже единообразно.
  const unified = `
    SELECT "cpu", "memory", "disk", "load1", 1::int AS w, "createdAt" AS ts
      FROM "ResourceMetric"
     WHERE "resourceId" = $1::uuid AND "createdAt" >= $2
    UNION ALL
    SELECT "cpu", "memory", "disk", "load1", GREATEST("samples", 1) AS w, "startsAt" AS ts
      FROM "ResourceMetricRollup"
     WHERE "resourceId" = $1::uuid AND "startsAt" >= $2
       -- Только часовые: суточные пересекались бы с ними и считались дважды.
       AND "bucket" = 'HOUR'
  `;

  const [summaryRows, hourRows] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `SELECT
         SUM("cpu"    * w) / NULLIF(SUM(CASE WHEN "cpu"    IS NULL THEN 0 ELSE w END), 0) AS cpu,
         SUM("memory" * w) / NULLIF(SUM(CASE WHEN "memory" IS NULL THEN 0 ELSE w END), 0) AS memory,
         SUM("disk"   * w) / NULLIF(SUM(CASE WHEN "disk"   IS NULL THEN 0 ELSE w END), 0) AS disk,
         SUM("load1"  * w) / NULLIF(SUM(CASE WHEN "load1"  IS NULL THEN 0 ELSE w END), 0) AS load1,
         COALESCE(SUM(w), 0) AS samples
       FROM (${unified}) u`,
      resourceId,
      since
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT
         EXTRACT(HOUR FROM (ts AT TIME ZONE 'UTC' AT TIME ZONE '${tz}'))::int AS hour,
         SUM("cpu" * w) / NULLIF(SUM(CASE WHEN "cpu" IS NULL THEN 0 ELSE w END), 0) AS cpu,
         COALESCE(SUM(w), 0) AS samples
       FROM (${unified}) u
       GROUP BY 1 ORDER BY 1`,
      resourceId,
      since
    ),
  ]);

  const s = summaryRows[0] ?? {};
  const summary: PeriodSummary = {
    cpu: round(s.cpu),
    memory: round(s.memory),
    disk: round(s.disk),
    load1: round(s.load1),
    samples: Number(s.samples ?? 0),
  };

  // Отдаём все 24 часа, даже пустые: иначе столбики на графике «схлопнутся» и
  // полночь окажется рядом с полуднем, а это читается как непрерывный ряд.
  const byHourMap = new Map<number, HourBucket>();
  for (const r of hourRows) {
    byHourMap.set(Number(r.hour), {
      hour: Number(r.hour),
      cpu: round(r.cpu),
      samples: Number(r.samples ?? 0),
    });
  }
  const byHour: HourBucket[] = Array.from({ length: 24 }, (_, h) =>
    byHourMap.get(h) ?? { hour: h, cpu: null, samples: 0 }
  );

  let peakHour: number | null = null;
  let peak = -1;
  for (const b of byHour) {
    if (b.cpu != null && b.cpu > peak) {
      peak = b.cpu;
      peakHour = b.hour;
    }
  }

  return { days, timezone: tz, summary, byHour, peakHour };
}
