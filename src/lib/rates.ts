// Курсы валют для пересчёта итога в выбранную валюту.
//
// Два источника на каждый тип и кеш в Redis. Два — не перестраховка: бесплатные
// API падают и упираются в лимиты, а из-за недоступного курса дашборд не должен
// оставаться без суммы. Кеш нужен по той же причине: обновлять курс чаще раза в
// час бессмысленно, а долбить чужой бесплатный сервис на каждый рендер — верный
// способ получить бан.
//
// Все курсы приводятся к USD как опорной: иначе для N валют пришлось бы знать
// N×N пар, а так — N значений.

import { getRedis, redisReady } from "./redis";

const TTL_SEC = 3600;
const KEY = "tucktuck:rates:v1";

export type Rates = {
  /** Сколько единиц валюты в одном USD. USD всегда 1. */
  perUsd: Record<string, number>;
  fetchedAt: string;
  sources: string[];
};

// Память процесса как второй эшелон: если Redis недоступен, панель всё равно
// не будет ходить в чужой API на каждый запрос.
let memory: Rates | null = null;
let memoryUntil = 0;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return isFinite(n) && n > 0 ? n : null;
};

/**
 * open.er-api.com — без ключа, отдаёт курсы к базе.
 *
 * Не exchangerate.host: он с некоторых пор требует ключ и на запрос без него
 * отвечает 200 с телом об ошибке, то есть молча даёт пустые курсы.
 */
async function fiatPrimary(): Promise<Record<string, number> | null> {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json();
    // Проверяем именно наличие курсов, а не код ответа: источник может
    // ответить 200 с телом об ошибке.
    if (!d?.rates) return null;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(d.rates)) {
      const n = num(v);
      if (n) out[k.toUpperCase()] = n;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** frankfurter.app — второй бесплатный источник, другой оператор. */
async function fiatFallback(): Promise<Record<string, number> | null> {
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=USD", {
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json();
    if (!d?.rates) return null;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(d.rates)) {
      const n = num(v);
      if (n) out[k.toUpperCase()] = n;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

// Монеты, которые реально встречаются в оплатах инфраструктуры.
const COINS = ["BTC", "ETH", "USDT", "USDC", "TON", "TRX", "LTC", "BNB", "SOL", "XMR"];

/** CoinGecko — цена монеты в USD. */
async function cryptoPrimary(): Promise<Record<string, number> | null> {
  const ids: Record<string, string> = {
    BTC: "bitcoin", ETH: "ethereum", USDT: "tether", USDC: "usd-coin",
    TON: "the-open-network", TRX: "tron", LTC: "litecoin", BNB: "binancecoin",
    SOL: "solana", XMR: "monero",
  };
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(ids).join(",")}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(8000) }
    );
    const d = await r.json();
    const out: Record<string, number> = {};
    for (const [sym, id] of Object.entries(ids)) {
      const usd = num(d?.[id]?.usd);
      // Храним «сколько монет в долларе», как и для фиата: единый вид избавляет
      // от развилки при пересчёте.
      if (usd) out[sym] = 1 / usd;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** Binance — второй источник, независимый от CoinGecko. */
async function cryptoFallback(): Promise<Record<string, number> | null> {
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/price", {
      signal: AbortSignal.timeout(8000),
    });
    const list = await r.json();
    if (!Array.isArray(list)) return null;
    const bySymbol = new Map<string, number>();
    for (const t of list) {
      const p = num(t?.price);
      if (p && typeof t.symbol === "string") bySymbol.set(t.symbol, p);
    }
    const out: Record<string, number> = {};
    for (const c of COINS) {
      // USDT к самому себе Binance не котирует — он и есть опорный доллар.
      if (c === "USDT") {
        out.USDT = 1;
        continue;
      }
      const p = bySymbol.get(`${c}USDT`);
      if (p) out[c] = 1 / p;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

async function readCache(): Promise<Rates | null> {
  if (memory && memoryUntil > Date.now()) return memory;
  try {
    if (!(await redisReady(1500))) return null;
    const raw = await getRedis().get(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Rates;
    memory = parsed;
    memoryUntil = Date.now() + 60_000;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(r: Rates): Promise<void> {
  memory = r;
  memoryUntil = Date.now() + 60_000;
  try {
    if (!(await redisReady(1500))) return;
    await getRedis().set(KEY, JSON.stringify(r), "EX", TTL_SEC);
  } catch {
    // Redis не обязателен: без него просто чаще ходим в источники.
  }
}

/**
 * Курсы: из кеша или из источников.
 *
 * Источники объединяются, а не выбирается один: фиатный список и криптовый не
 * пересекаются, и если упал только один, второй тип всё равно посчитается.
 */
export async function getRates(force = false): Promise<Rates> {
  if (!force) {
    const cached = await readCache();
    if (cached) return cached;
  }

  const [f1, f2, c1, c2] = await Promise.all([
    fiatPrimary(),
    fiatFallback(),
    cryptoPrimary(),
    cryptoFallback(),
  ]);

  const sources: string[] = [];
  const perUsd: Record<string, number> = { USD: 1 };

  // Порядок важен: первый источник считается основным, второй дополняет
  // пропуски, а не перетирает уже полученное.
  const merge = (src: Record<string, number> | null, name: string) => {
    if (!src) return;
    sources.push(name);
    for (const [k, v] of Object.entries(src)) if (!(k in perUsd)) perUsd[k] = v;
  };
  merge(f1, "open.er-api.com");
  merge(f2, "frankfurter.app");
  merge(c1, "coingecko");
  merge(c2, "binance");

  const rates: Rates = { perUsd, fetchedAt: new Date().toISOString(), sources };
  // Кешируем только если что-то реально получили: пустышка на час оставила бы
  // дашборд без сумм даже после того, как источники поднимутся.
  if (sources.length) await writeCache(rates);
  return rates;
}

/** Перевод суммы между валютами. null — курс одной из них неизвестен. */
export function convert(
  amount: number,
  from: string,
  to: string,
  perUsd: Record<string, number>
): number | null {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return amount;
  const rf = perUsd[f];
  const rt = perUsd[t];
  if (!rf || !rt) return null;
  // amount / rf — сколько это в долларах; дальше в целевую валюту.
  return (amount / rf) * rt;
}
