// Диспатчер запросов через прокси для fetch.
//
// Зачем вообще: с части хостингов (в том числе того, где живёт панель)
// api.telegram.org недоступен — соединение виснет до таймаута и по IPv4, и по
// IPv6. Без прокси боты там не заводятся вовсе.
//
// Поддержаны две схемы, и это не роскошь:
//   http://  https://  — обычный HTTP-прокси, undici умеет сам (CONNECT-туннель);
//   socks5:// socks4:// — undici НЕ умеет, нужен свой connect поверх socks.
//
// Формат: schema://[user:pass@]host:port

import { Agent, ProxyAgent, type Dispatcher } from "undici";
import { SocksClient, type SocksProxy } from "socks";

// Кеш по адресу: у ботов могут быть разные прокси, а агент держит пул
// соединений — создавать новый на каждый запрос значило бы пул не иметь вовсе.
const cache = new Map<string, Dispatcher | null>();

function parseSocks(url: URL): SocksProxy {
  const port = Number(url.port);
  if (!url.hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("proxy url has no host:port");
  }
  return {
    host: url.hostname,
    port,
    type: url.protocol === "socks4:" ? 4 : 5,
    ...(url.username ? { userId: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
  };
}

/**
 * SOCKS-диспатчер: подменяем у undici только фазу установки соединения.
 *
 * TLS поверх сокса поднимает сам undici — мы отдаём ему уже пробитый сокет, и
 * сертификат проверяется как обычно, по имени хоста. Заворачивать TLS руками
 * значило бы делать это самим и почти наверняка забыть про проверку.
 */
function socksDispatcher(proxy: SocksProxy): Dispatcher {
  return new Agent({
    connect: async (opts: any, callback: any) => {
      try {
        const { socket } = await SocksClient.createConnection({
          proxy,
          command: "connect",
          destination: {
            host: opts.hostname,
            // Порт в opts приходит строкой и пустым для схемы по умолчанию.
            port: Number(opts.port) || (opts.protocol === "https:" ? 443 : 80),
          },
          timeout: 15_000,
        });

        if (opts.protocol !== "https:") return callback(null, socket);

        // Для https поднимаем TLS поверх полученного сокета средствами undici.
        const tls = await import("node:tls");
        const tlsSocket = tls.connect({
          socket,
          servername: opts.servername || opts.hostname,
          host: opts.hostname,
        });
        tlsSocket.once("secureConnect", () => callback(null, tlsSocket));
        tlsSocket.once("error", (err: Error) => callback(err, null));
      } catch (err) {
        callback(err as Error, null);
      }
    },
  });
}

/**
 * Диспатчер для адреса прокси. Пустой адрес — null, идём напрямую.
 *
 * Кривой адрес не роняет запрос: логируем и идём напрямую. Опечатка в поле
 * настроек не должна оставлять панель без отправки напоминаний — формой она
 * уже проверена, здесь это последний рубеж.
 */
export function dispatcherFor(raw: string): Dispatcher | null {
  const key = (raw || "").trim();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;

  let d: Dispatcher | null = null;
  try {
    const url = new URL(key);
    if (url.protocol === "socks5:" || url.protocol === "socks4:" || url.protocol === "socks:") {
      d = socksDispatcher(parseSocks(url));
    } else if (url.protocol === "http:" || url.protocol === "https:") {
      d = new ProxyAgent(key);
    } else {
      console.error(`[proxy] unsupported scheme ${url.protocol}, going direct`);
    }
  } catch (e) {
    console.error("[proxy] could not parse proxy url, going direct:", e);
  }
  cache.set(key, d);
  return d;
}

/** Сбросить кеш — после смены настроек прокси в панели. */
export function resetProxyCache() {
  cache.clear();
}
