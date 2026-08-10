// Настройки системы: одна строка на установку, читается часто, меняется редко.

import fs from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";
import { safeTimezone } from "./timezone";
import { isLocale, resolveLocale, type Locale } from "./i18n/config";
import type { TFunc } from "./i18n/translate";

export type AppSettingsView = {
  timezone: string;
  metricsRetentionDays: number;
  displayCurrency: string;
  /** Язык сообщений бота. Не язык интерфейса: см. схему AppSettings. */
  notifyLocale: Locale;
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
export async function getSettings(): Promise<AppSettingsView> {
  const s = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  return {
    timezone: safeTimezone(s?.timezone) ?? serverTimezone(),
    metricsRetentionDays: s?.metricsRetentionDays ?? 90,
    displayCurrency: (s?.displayCurrency || "USD").toUpperCase(),
    notifyLocale: resolveLocale(s?.notifyLocale),
  };
}

/** Проверка перед сохранением. Возвращает текст ошибки или null. */
export function validateSettings(b: {
  timezone?: unknown;
  metricsRetentionDays?: unknown;
  displayCurrency?: unknown;
  notifyLocale?: unknown;
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
  return null;
}
