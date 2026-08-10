// Настройки системы: одна строка на установку, читается часто, меняется редко.

import fs from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";
import { safeTimezone } from "./timezone";
import { isLocale, resolveLocale, type Locale } from "./i18n/config";
import { parseHour } from "./quiet-hours";
import { getRedis, redisReady } from "./redis";
import type { TFunc } from "./i18n/translate";

export type AppSettingsView = {
  timezone: string;
  metricsRetentionDays: number;
  displayCurrency: string;
  /** Язык сообщений бота. Не язык интерфейса: см. схему AppSettings. */
  notifyLocale: Locale;
  /** Окно, в которое можно писать в Телеграм. Равные значения — круглосуточно. */
  notifyFromHour: number;
  notifyToHour: number;
  /** Публичная половина ключа капчи. Секретная наружу не отдаётся никогда. */
  turnstileSiteKey: string;
};

import { RETENTION_MIN, RETENTION_MAX } from "./settings-config";
export { RETENTION_PRESETS, RETENTION_MIN, RETENTION_MAX } from "./settings-config";

/**
 * Часовой пояс ХОСТА, а не контейнера.
 *
 * Разница не теоретическая: контейнер без переменной TZ всегда живёт в UTC,
 * даже если сервер стоит в Москве. Пояс нужен для суточного распределения
 * нагрузки, и с UTC пик в 20:00 по месту показывался бы на 23:00.
 *
 * Хостовый корень уже примонтирован только на чтение ради метрик диска —
 * оттуда и читаем, ничего нового монтировать не нужно.
 *
 * Порядок: TZ (явная настройка) → /etc/timezone хоста → ссылка
 * /etc/localtime → пояс процесса.
 */
function readHostTimezone(): string | null {
  const root = process.env.TUCKTUCK_HOST_ROOT || "";
  const at = (p: string) => (root ? path.join(root, p) : p);

  // Debian, Ubuntu: одна строка с названием пояса.
  try {
    const raw = fs.readFileSync(at("etc/timezone"), "utf8").trim();
    if (raw) return raw;
  } catch {
    // Файла нет — это норма для RHEL и Alpine, идём дальше.
  }

  // Везде: симлинк на файл зоны в zoneinfo.
  try {
    const link = fs.readlinkSync(at("etc/localtime"));
    const i = link.indexOf("zoneinfo/");
    if (i >= 0) return link.slice(i + "zoneinfo/".length);
  } catch {
    // Не симлинк, а копия файла — названия зоны в ней нет.
  }
  return null;
}

// Память на результат, а не просто «посчитали один раз»: ключом идут те самые
// входные данные, от которых он зависит. Так кеш не врёт, если они изменились.
let cached: { key: string; value: string } | null = null;

export function serverTimezone(): string {
  const key = `${process.env.TZ || ""}|${process.env.TUCKTUCK_HOST_ROOT || ""}`;
  if (cached && cached.key === key) return cached.value;

  const fromEnv = safeTimezone(process.env.TZ);
  const fromHost = fromEnv ? null : safeTimezone(readHostTimezone());
  let tz = fromEnv || fromHost;
  if (!tz) {
    try {
      tz = safeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      tz = null;
    }
  }
  // Читаем с диска один раз: пояс хоста не меняется между запросами, а
  // getSettings зовётся на каждый показ истории метрик.
  cached = { key, value: tz || "UTC" };
  return cached.value;
}

/**
 * Настройки с подстановкой значений по умолчанию.
 *
 * Строки может не быть вовсе — до первого сохранения. Заводить её миграцией
 * не стали: пустая таблица честнее строки с выдуманными значениями, а дефолты
 * всё равно нужны на случай, если её удалят руками.
 */
const CACHE_KEY = "tucktuck:settings:v1";
const CACHE_TTL_SEC = 300;
const MEMORY_TTL_MS = 30_000;

let memory: AppSettingsView | null = null;
let memoryUntil = 0;

function shape(s: {
  timezone?: string | null;
  metricsRetentionDays?: number | null;
  displayCurrency?: string | null;
  notifyLocale?: string | null;
  notifyFromHour?: number | null;
  notifyToHour?: number | null;
  turnstileSiteKey?: string | null;
} | null): AppSettingsView {
  return {
    timezone: safeTimezone(s?.timezone) ?? serverTimezone(),
    metricsRetentionDays: s?.metricsRetentionDays ?? 90,
    displayCurrency: (s?.displayCurrency || "USD").toUpperCase(),
    notifyLocale: resolveLocale(s?.notifyLocale),
    notifyFromHour: parseHour(s?.notifyFromHour) ?? 0,
    notifyToHour: parseHour(s?.notifyToHour) ?? 0,
    turnstileSiteKey: (s?.turnstileSiteKey || "").trim(),
  };
}

/**
 * Настройки с подстановкой значений по умолчанию.
 *
 * Строки может не быть вовсе — до первого сохранения. Заводить её миграцией
 * не стали: пустая таблица честнее строки с выдуманными значениями, а дефолты
 * всё равно нужны на случай, если её удалят руками.
 *
 * Два эшелона кеша. Настройки читаются на каждый показ метрик, на каждый
 * пересчёт итога и на каждый тик воркера, а меняются раз в жизни — ходить за
 * ними в базу каждый раз незачем. Redis общий на все процессы, память процесса
 * прикрывает те 30 секунд, когда и до Redis идти не стоит. Без Redis работает
 * ровно как раньше, просто чаще ходит в базу.
 */
export async function getSettings(): Promise<AppSettingsView> {
  if (memory && memoryUntil > Date.now()) return memory;

  try {
    if (await redisReady(1000)) {
      const raw = await getRedis().get(CACHE_KEY);
      if (raw) {
        const parsed = shape(JSON.parse(raw));
        memory = parsed;
        memoryUntil = Date.now() + MEMORY_TTL_MS;
        return parsed;
      }
    }
  } catch {
    // Redis недоступен — не повод падать: ниже обычный запрос к базе.
  }

  const row = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  const view = shape(row);
  memory = view;
  memoryUntil = Date.now() + MEMORY_TTL_MS;
  try {
    if (await redisReady(1000)) {
      await getRedis().set(CACHE_KEY, JSON.stringify(view), "EX", CACHE_TTL_SEC);
    }
  } catch {
    // Кеш не обязателен.
  }
  return view;
}

/**
 * Сбросить кеш настроек. Зовётся при сохранении.
 *
 * Без этого правка в интерфейсе вступала бы в силу через пять минут, и человек
 * решил бы, что настройка не работает.
 */
export async function invalidateSettingsCache(): Promise<void> {
  memory = null;
  memoryUntil = 0;
  try {
    if (await redisReady(1000)) await getRedis().del(CACHE_KEY);
  } catch {
    // Не страшно: память процесса уже сброшена, остальные подтянут через TTL.
  }
}

/** Проверка перед сохранением. Возвращает текст ошибки или null. */
export function validateSettings(b: {
  timezone?: unknown;
  metricsRetentionDays?: unknown;
  displayCurrency?: unknown;
  notifyLocale?: unknown;
  notifyFromHour?: unknown;
  notifyToHour?: unknown;
  turnstileSiteKey?: unknown;
}, t: TFunc): string | null {
  if (b.timezone !== undefined) {
    // safeTimezone проверяет по системному списку Intl: свой перечень пришлось
    // бы поддерживать вручную, и он всё равно отстал бы от tzdata.
    if (!safeTimezone(b.timezone)) return t("settings.err.unknownTimezone");
  }
  if (b.metricsRetentionDays !== undefined) {
    const n = Number(b.metricsRetentionDays);
    if (!Number.isInteger(n) || n < RETENTION_MIN || n > RETENTION_MAX) {
      return t("settings.err.retentionRange", { min: RETENTION_MIN, max: RETENTION_MAX });
    }
  }
  if (b.displayCurrency !== undefined) {
    const c = String(b.displayCurrency).trim().toUpperCase();
    if (!/^[A-Z]{2,10}$/.test(c)) return t("settings.err.currencyFormat");
  }
  if (b.notifyLocale !== undefined && !isLocale(b.notifyLocale)) {
    return t("settings.err.unknownLocale");
  }
  for (const k of ["notifyFromHour", "notifyToHour"] as const) {
    if (b[k] !== undefined && parseHour(b[k]) === null) return t("settings.err.hourRange");
  }
  if (b.turnstileSiteKey !== undefined) {
    const v = String(b.turnstileSiteKey).trim();
    // Ключ сайта Turnstile — короткая строка вида 0x4AAAA…; пробелы и переводы
    // строк в ней означают, что скопировали лишнее.
    if (v && !/^[\w-]{8,64}$/.test(v)) return t("settings.err.siteKeyFormat");
  }
  return null;
}
