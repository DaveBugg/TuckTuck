// Метрики сервера, на котором работает сама панель.
//
// Агент сюда ставить не нужно и нечем: панель живёт в контейнере, а мерить надо
// ХОСТ. Поэтому в контейнер монтируются хостовые /proc и корень — только на
// чтение (см. docker-compose.yml). Так же поступает node_exporter.
//
// Без монтирования всё равно работает, просто показывает контейнер: /proc/stat
// в докере и так отдаёт счётчики хоста, а вот память и диск будут контейнерные.

import { readFile, statfs } from "node:fs/promises";
import os from "node:os";

// Пути внутри контейнера. Если хостовые не смонтированы, читаем свои — лучше
// показать метрики контейнера, чем не показать ничего.
const PROC = process.env.TUCKTUCK_HOST_PROC || "/proc";
const ROOT = process.env.TUCKTUCK_HOST_ROOT || "/";

export type SelfSample = {
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  load1: number | null;
  uptimeSec: number | null;
  cores: number | null;
};

/** Прошлый снимок счётчиков CPU — та же схема, что в агенте. */
let prevCpu: { total: number; idle: number } | null = null;

async function readCpuCounters(): Promise<{ total: number; idle: number } | null> {
  try {
    const txt = await readFile(`${PROC}/stat`, "utf8");
    const line = txt.split("\n").find(l => l.startsWith("cpu "));
    if (!line) return null;
    const n = line.trim().split(/\s+/).slice(1).map(Number);
    if (n.some(v => !isFinite(v))) return null;
    const total = n.reduce((a, b) => a + b, 0);
    // idle + iowait: время, когда процессор реально ничем не занят.
    const idle = (n[3] ?? 0) + (n[4] ?? 0);
    return { total, idle };
  } catch {
    return null;
  }
}

async function readMemoryPct(): Promise<number | null> {
  try {
    const txt = await readFile(`${PROC}/meminfo`, "utf8");
    const get = (k: string) => {
      const m = new RegExp(`^${k}:\\s+(\\d+)`, "m").exec(txt);
      return m ? Number(m[1]) : null;
    };
    const total = get("MemTotal");
    // MemAvailable, а не MemFree: free не учитывает кеш, который ядро отдаст по
    // первому требованию, и на живой машине показывал бы «памяти нет».
    const avail = get("MemAvailable");
    if (!total || avail == null) return null;
    return ((total - avail) * 100) / total;
  } catch {
    return null;
  }
}

async function readDiskPct(): Promise<number | null> {
  try {
    const st = await statfs(ROOT);
    const total = Number(st.blocks) * Number(st.bsize);
    // bavail, а не bfree: часть места зарезервирована под root, и считать её
    // свободной значит обещать место, которого обычным процессам не дадут.
    const free = Number(st.bavail) * Number(st.bsize);
    if (!total) return null;
    return ((total - free) * 100) / total;
  } catch {
    return null;
  }
}

async function readLoadAndUptime(): Promise<{ load1: number | null; uptimeSec: number | null }> {
  let load1: number | null = null;
  let uptimeSec: number | null = null;
  try {
    const l = await readFile(`${PROC}/loadavg`, "utf8");
    const v = Number(l.trim().split(/\s+/)[0]);
    if (isFinite(v)) load1 = v;
  } catch {
    // os.loadavg() читает /proc/loadavg процесса — для контейнера это тот же
    // хостовый файл, так что как запасной вариант годится.
    const v = os.loadavg()[0];
    if (isFinite(v)) load1 = v;
  }
  try {
    const u = await readFile(`${PROC}/uptime`, "utf8");
    const v = Number(u.trim().split(/\s+/)[0]);
    if (isFinite(v)) uptimeSec = Math.floor(v);
  } catch {
    uptimeSec = Math.floor(os.uptime());
  }
  return { load1, uptimeSec };
}

const clampPct = (v: number | null) =>
  v == null || !isFinite(v) ? null : Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;

/**
 * Снять метрики хоста.
 *
 * CPU считается как разница с прошлым вызовом — ровно как в агенте и по той же
 * причине: замер «здесь и сейчас» с паузой мерил бы в том числе саму панель.
 * Поэтому первый вызов отдаёт cpu: null.
 */
export async function collectSelf(): Promise<SelfSample> {
  const cur = await readCpuCounters();
  let cpu: number | null = null;
  if (cur && prevCpu) {
    const dt = cur.total - prevCpu.total;
    const di = cur.idle - prevCpu.idle;
    // dt<=0 — счётчики сбросились (перезагрузка). Показать нечего.
    if (dt > 0) cpu = clampPct(((dt - di) * 100) / dt);
  }
  if (cur) prevCpu = cur;

  const [memory, disk, la] = await Promise.all([
    readMemoryPct(),
    readDiskPct(),
    readLoadAndUptime(),
  ]);

  return {
    cpu,
    memory: clampPct(memory),
    disk: clampPct(disk),
    load1: la.load1,
    uptimeSec: la.uptimeSec,
    cores: os.cpus().length || null,
  };
}
