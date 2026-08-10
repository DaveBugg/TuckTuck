// Здоровье ресурсов: статус по свежести последнего снимка, разбор того, что
// прислал агент, пороги для подсветки.
//
// Функции чистые — проверяются юнит-тестом без БД и без сети.

import type { TFunc } from "./i18n/translate";

/** Как часто агент шлёт по умолчанию (секунды). Совпадает с scripts/agent.sh. */
export const AGENT_INTERVAL_SEC = 60;

/**
 * Ресурс считается недоступным, если снимков нет дольше этого срока.
 *
 * Три интервала, а не один: сеть моргает, агент перезапускается вместе с
 * машиной, а cron просыпается неровно. Порог в один интервал давал бы
 * «упал/поднялся» по несколько раз в день на совершенно живом сервере.
 */
export const STALE_AFTER_SEC = AGENT_INTERVAL_SEC * 3;

export type Health = "up" | "stale" | "down" | "unknown";

/**
 * Статус по времени последнего снимка.
 *   unknown — агент не подключён (снимков не было ни разу);
 *   up      — снимок свежий;
 *   stale   — молчит дольше порога, но меньше часа: скорее всего перезапуск;
 *   down    — молчит больше часа, это уже не «моргнуло».
 */
export function health(lastSeen: Date | null, now: Date = new Date()): Health {
  if (!lastSeen) return "unknown";
  const ageSec = (now.getTime() - lastSeen.getTime()) / 1000;
  if (ageSec <= STALE_AFTER_SEC) return "up";
  if (ageSec <= 3600) return "stale";
  return "down";
}

/** Подпись статуса. Функция, а не словарь: словарь застыл бы на одном языке. */
export function healthLabel(h: Health, t: TFunc): string {
  return t(`health.${h}`);
}

/** Порог подсветки метрики. 90+ — красное, 70+ — жёлтое. */
export function metricLevel(pct: number | null): "ok" | "warn" | "crit" | "none" {
  if (pct == null) return "none";
  if (pct >= 90) return "crit";
  if (pct >= 70) return "warn";
  return "ok";
}

/**
 * Худшее из состояний машины одним значением: и здоровье, и все метрики.
 *
 * Нужно там, где места ровно на один значок. Молчащая машина важнее занятого
 * диска, поэтому здоровье проверяется первым: у неё цифры всё равно устарели.
 */
export function worstLevel(s: {
  health: Health;
  cpu: number | null;
  memory: number | null;
  disk: number | null;
}): "ok" | "warn" | "crit" | "none" {
  if (s.health === "down") return "crit";
  if (s.health === "stale") return "warn";
  if (s.health === "unknown") return "none";
  const levels = [metricLevel(s.cpu), metricLevel(s.memory), metricLevel(s.disk)];
  if (levels.includes("crit")) return "crit";
  if (levels.includes("warn")) return "warn";
  // Все три пусты — данных ещё нет, и зелёный тут был бы обещанием, которого
  // никто не давал.
  return levels.every(l => l === "none") ? "none" : "ok";
}

/** Процент из произвольного значения агента. Мусор и выход за 0..100 → null. */
export function pct(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!isFinite(n)) return null;
  // Не клампим молча: 150% означает, что агент прислал не то, и показать это
  // честнее, чем нарисовать «100% диска» и заставить искать несуществующую беду.
  if (n < 0 || n > 100) return null;
  return Math.round(n * 10) / 10;
}

/** Неотрицательное целое (аптайм) или null. */
export function nonNegInt(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/** Число с плавающей точкой (load average) или null. */
export function nonNegFloat(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** «5 дн. 3 ч» — аптайм словами. */
export function uptimeText(sec: number | null, t: TFunc): string {
  if (sec == null || sec <= 0) return "";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  // Мелкие единицы опускаем, когда есть крупные: «5 дн. 3 ч 12 мин» читается
  // хуже, чем «5 дн. 3 ч», а точность до минуты у аптайма никому не нужна.
  if (d > 0) return t("uptime.d", { d }) + (h ? " " + t("uptime.h", { h }) : "");
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return t("uptime.h", { h }) + (m ? " " + t("uptime.m", { m }) : "");
  return t("uptime.m", { m });
}

/** «2 мин назад» — насколько свежий снимок. */
export function agoText(d: Date | null, t: TFunc, now: Date = new Date()): string {
  if (!d) return "";
  const sec = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
  if (sec < 60) return t("ago.now");
  const min = Math.floor(sec / 60);
  if (min < 60) return t("ago.min", { count: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("ago.hour", { count: h });
  return t("ago.day", { count: Math.floor(h / 24) });
}

/** Типы ресурсов, у которых мониторинг вообще имеет смысл. */
export const MONITORABLE = ["SERVER", "VPN", "PROXY"] as const;
