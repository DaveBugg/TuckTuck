// Ограничение частоты попыток. Нужно на входе: без него пароль перебирается
// со скоростью сети, а капча включена не у всех и не всегда.
//
// Счётчик в Redis, потому что процессов может быть несколько, и лимит «на
// процесс» подбирается умножением на их количество. Память процесса остаётся
// вторым эшелоном: с одним контейнером она работает не хуже, а без Redis
// одна — единственная защита.
//
// Fail-open осознанно: если Redis лёг, вход должен продолжать работать. Иначе
// падение кеша превращается в запертую панель, а это хуже, чем ослабленная на
// время защита от перебора — тем более что счётчик в памяти при этом жив.

import { getRedis, redisReady } from "./redis";

export type RateVerdict = {
  ok: boolean;
  /** Сколько секунд ждать до следующей попытки. 0, если ждать не нужно. */
  retryAfterSec: number;
};

type Bucket = { count: number; resetAt: number };
const memory = new Map<string, Bucket>();

/** Чистка памяти: без неё карта растёт на каждый новый ключ и не убывает. */
function sweep(now: number): void {
  if (memory.size < 500) return;
  for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
}

function hitMemory(key: string, limit: number, windowSec: number, now: number): RateVerdict {
  sweep(now);
  const b = memory.get(key);
  if (!b || b.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSec: 0 };
}

async function hitRedis(
  key: string,
  limit: number,
  windowSec: number
): Promise<RateVerdict | null> {
  try {
    if (!(await redisReady(700))) return null;
    const r = getRedis();
    const k = `tucktuck:rl:${key}`;
    // INCR и EXPIRE только при первом попадании — так окно фиксированное, а не
    // скользящее с бесконечным продлением при постоянном долблении.
    const count = await r.incr(k);
    if (count === 1) await r.expire(k, windowSec);
    if (count > limit) {
      const ttl = await r.ttl(k);
      return { ok: false, retryAfterSec: ttl > 0 ? ttl : windowSec };
    }
    return { ok: true, retryAfterSec: 0 };
  } catch {
    return null;
  }
}

/**
 * Засчитать попытку и сказать, можно ли продолжать.
 *
 * Считаем в обоих хранилищах: память ловит всплеск даже когда Redis отвечает
 * медленно, Redis сводит счёт между процессами.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
  now: number = Date.now()
): Promise<RateVerdict> {
  const local = hitMemory(key, limit, windowSec, now);
  const shared = await hitRedis(key, limit, windowSec);
  if (shared && !shared.ok) return shared;
  return local;
}

/**
 * Сбросить счётчик. Зовётся после успешного входа: иначе человек, который
 * ошибся паролем пару раз и вошёл, оставался бы с почти исчерпанным лимитом.
 */
export async function rateLimitReset(key: string): Promise<void> {
  memory.delete(key);
  try {
    if (await redisReady(700)) await getRedis().del(`tucktuck:rl:${key}`);
  } catch {
    // Счётчик истечёт сам.
  }
}

/** Ключ по IP. Пустой адрес — общий ключ: лучше грубо, чем никак. */
export const ipKey = (scope: string, ip: string) => `${scope}:ip:${ip || "unknown"}`;

/**
 * Ключ по логину. Адрес приводим к нижнему регистру и обрезаем: длинная строка
 * в ключе — это трата памяти Redis на того, кто прислал мусор.
 */
export const idKey = (scope: string, id: string) =>
  `${scope}:id:${id.toLowerCase().slice(0, 120)}`;
