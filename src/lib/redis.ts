// Единый клиент Redis. Ленивое подключение, fail-soft: вызывающий код обязан
// переживать недоступность (мы гасим 'error', чтобы сетевые сбои не роняли
// процесс). Redis здесь не хранилище, а кеш курсов и настроек — без него всё
// работает, просто чаще ходим в источники и в базу.
//
// Пустой REDIS_URL означает «Redis нет», а не «попробуй localhost». Прежнее
// умолчание на 127.0.0.1 заставляло установку без Redis вечно переподключаться
// в фоне: сокеты, шум в логах и процесс, который не может завершиться, потому
// что таймер переподключения держит цикл событий.
import Redis from "ioredis";

let client: Redis | null = null;

/** Настроен ли Redis вообще. Пусто = нет, и это нормальный режим работы. */
export function redisConfigured(): boolean {
  return !!(process.env.REDIS_URL || "").trim();
}

export function getRedis(): Redis {
  if (client) return client;
  const url = (process.env.REDIS_URL || "").trim();
  client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false, // горячий путь не виснет, если redis недоступен
    commandTimeout: 3000,
    retryStrategy: times => Math.min(times * 200, 2000),
  });
  // Без обработчика 'error' ioredis бросает unhandled и валит процесс.
  client.on("error", () => {});
  return client;
}

/**
 * Дождаться готовности соединения. С enableOfflineQueue=false команды до
 * 'ready' отклоняются, поэтому перед обращением ждём — с таймаутом, чтобы
 * недоступный Redis не задерживал ответ страницы.
 */
export function redisReady(timeoutMs = 3000): Promise<boolean> {
  if (!redisConfigured()) return Promise.resolve(false);
  const r = getRedis();
  if (r.status === "ready") return Promise.resolve(true);
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(false), timeoutMs);
    r.once("ready", () => {
      clearTimeout(t);
      resolve(true);
    });
  });
}
