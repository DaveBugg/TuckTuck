// Свёртка метрик и чистка истории.
//
// Минутные точки долго хранить нельзя: при интервале в минуту это полмиллиона
// строк в год на КАЖДЫЙ сервер, и график за месяц строился бы по сорока
// тысячам точек. Свёртка оставляет от года пару тысяч строк, а суточное
// распределение нагрузки при этом остаётся точным — час достаточно подробен,
// чтобы увидеть пик.
//
// Порядок хранения:
//   сырые минутные точки  — сутки
//   часовые средние       — до срока хранения
//   суточные средние      — до срока хранения
//
// Свёртка идемпотентна: пересчёт того же интервала перезаписывает строку, а не
// добавляет вторую (уникальность по ресурсу, типу и началу интервала).

import { prisma } from "./prisma";
import { getSettings } from "./settings";

/** Сколько живут сырые точки, прежде чем от них останутся только часовые. */
export const RAW_KEEP_HOURS = 24;
/** Через сколько дней часовые схлопываются в суточные. */
export const HOURLY_KEEP_DAYS = 30;

export type RollupResult = {
  hourly: number;
  daily: number;
  rawDeleted: number;
  hourlyDeleted: number;
  oldDeleted: number;
};

/**
 * Один проход обслуживания истории.
 *
 * Всё делается ОДНИМ SQL на каждый шаг, а не выборкой в память: на парке из
 * двадцати машин это десятки тысяч строк, и тянуть их в node ради среднего
 * значения бессмысленно.
 */
export async function rollupMetrics(now = new Date()): Promise<RollupResult> {
  const { metricsRetentionDays } = await getSettings();

  const rawBefore = new Date(now.getTime() - RAW_KEEP_HOURS * 3600_000);
  const hourlyBefore = new Date(now.getTime() - HOURLY_KEEP_DAYS * 86400_000);
  const retentionBefore = new Date(now.getTime() - metricsRetentionDays * 86400_000);

  // ── часовые из сырых ──
  // date_trunc в UTC: местный час считается на чтении, по настройке пояса.
  // Иначе смена пояса потребовала бы пересчёта всей накопленной истории.
  const hourly = await prisma.$executeRaw`
    INSERT INTO "ResourceMetricRollup" ("id", "resourceId", "bucket", "startsAt", "cpu", "memory", "disk", "load1", "samples")
    SELECT gen_random_uuid(), "resourceId", 'HOUR', date_trunc('hour', "createdAt"),
           AVG("cpu"), AVG("memory"), AVG("disk"), AVG("load1"), COUNT(*)
    FROM "ResourceMetric"
    WHERE "createdAt" < ${rawBefore}
    GROUP BY "resourceId", date_trunc('hour', "createdAt")
    ON CONFLICT ("resourceId", "bucket", "startsAt")
    DO UPDATE SET "cpu" = EXCLUDED."cpu", "memory" = EXCLUDED."memory",
                  "disk" = EXCLUDED."disk", "load1" = EXCLUDED."load1",
                  "samples" = EXCLUDED."samples"`;

  // Сырые удаляем только ПОСЛЕ успешной вставки часовых: обратный порядок при
  // сбое между шагами потерял бы данные безвозвратно.
  const rawDeleted = await prisma.$executeRaw`
    DELETE FROM "ResourceMetric" WHERE "createdAt" < ${rawBefore}`;

  // ── суточные из часовых ──
  // Взвешивание по samples: часы с разным числом точек не равны, и простое
  // среднее по средним завысило бы вклад часа, где сервер почти молчал.
  const daily = await prisma.$executeRaw`
    INSERT INTO "ResourceMetricRollup" ("id", "resourceId", "bucket", "startsAt", "cpu", "memory", "disk", "load1", "samples")
    SELECT gen_random_uuid(), "resourceId", 'DAY', date_trunc('day', "startsAt"),
           SUM("cpu" * "samples") / NULLIF(SUM(CASE WHEN "cpu" IS NULL THEN 0 ELSE "samples" END), 0),
           SUM("memory" * "samples") / NULLIF(SUM(CASE WHEN "memory" IS NULL THEN 0 ELSE "samples" END), 0),
           SUM("disk" * "samples") / NULLIF(SUM(CASE WHEN "disk" IS NULL THEN 0 ELSE "samples" END), 0),
           SUM("load1" * "samples") / NULLIF(SUM(CASE WHEN "load1" IS NULL THEN 0 ELSE "samples" END), 0),
           SUM("samples")
    FROM "ResourceMetricRollup"
    WHERE "bucket" = 'HOUR' AND "startsAt" < ${hourlyBefore}
    GROUP BY "resourceId", date_trunc('day', "startsAt")
    ON CONFLICT ("resourceId", "bucket", "startsAt")
    DO UPDATE SET "cpu" = EXCLUDED."cpu", "memory" = EXCLUDED."memory",
                  "disk" = EXCLUDED."disk", "load1" = EXCLUDED."load1",
                  "samples" = EXCLUDED."samples"`;

  const hourlyDeleted = await prisma.$executeRaw`
    DELETE FROM "ResourceMetricRollup"
    WHERE "bucket" = 'HOUR' AND "startsAt" < ${hourlyBefore}`;

  // ── за пределами срока хранения ──
  const oldDeleted = await prisma.$executeRaw`
    DELETE FROM "ResourceMetricRollup" WHERE "startsAt" < ${retentionBefore}`;

  return { hourly, daily, rawDeleted, hourlyDeleted, oldDeleted };
}
