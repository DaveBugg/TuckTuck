// Тонкий клиент Telegram Bot API. Без библиотеки: нужны несколько методов, а
// любая обёртка притащила бы свой рантайм и polling, который нам не нужен —
// напоминания шлёт воркер, входящие принимает вебхук.

import { dispatcherFor } from "./proxy-dispatcher";

const API = "https://api.telegram.org/bot";

export type TgResult<T = unknown> =
  | { ok: true; result: T }
  // network — до Телеграма не достучались (блокировка, прокси, таймаут).
  // Отличается от отказа API намеренно: «неверный токен» и «нет связи» лечатся
  // совершенно по-разному, и путать их в сообщении пользователю нельзя.
  | { ok: false; error: string; network?: boolean };

/**
 * Прокси передаётся ПАРАМЕТРОМ, а не читается из окружения внутри.
 *
 * У разных ботов он может отличаться, а разрешение «бот → общий → env» живёт в
 * lib/notify-proxy. Клиент остаётся тонким: он умеет ходить в API, а не знать,
 * откуда берутся настройки.
 */
async function call<T>(
  token: string,
  method: string,
  body: unknown,
  proxyUrl = ""
): Promise<TgResult<T>> {
  try {
    const agent = dispatcherFor(proxyUrl);
    const res = await fetch(`${API}${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Телеграм иногда отвечает минутами; воркер не должен висеть на этом.
      signal: AbortSignal.timeout(15_000),
      ...(agent ? ({ dispatcher: agent } as Record<string, unknown>) : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.description || `HTTP ${res.status}` };
    }
    return { ok: true, result: data.result as T };
  } catch (e) {
    const cause = (e as { cause?: { code?: string } })?.cause?.code;
    const msg = e instanceof Error ? e.message : "network unreachable";
    return { ok: false, error: cause ? `${msg} (${cause})` : msg, network: true };
  }
}

export type InlineButton = { text: string; callback_data: string };

export function sendMessage(
  token: string,
  chatId: string,
  text: string,
  buttons?: InlineButton[][],
  proxyUrl = ""
) {
  return call<{ message_id: number }>(
    token,
    "sendMessage",
    {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      // Превью ссылок в напоминании об оплате только мешает.
      link_preview_options: { is_disabled: true },
      ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
    },
    proxyUrl
  );
}

export function editMessageText(
  token: string,
  chatId: string,
  messageId: string,
  text: string,
  buttons?: InlineButton[][],
  proxyUrl = ""
) {
  return call(
    token,
    "editMessageText",
    {
      chat_id: chatId,
      message_id: Number(messageId),
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      // Пустой inline_keyboard — это СНЯТЬ кнопки. Отсутствие поля их бы оставило.
      reply_markup: { inline_keyboard: buttons ?? [] },
    },
    proxyUrl
  );
}

/** Ответ на нажатие. Без него у пользователя крутится «часики» до таймаута. */
export function answerCallbackQuery(
  token: string,
  id: string,
  text?: string,
  alert = false,
  proxyUrl = ""
) {
  return call(
    token,
    "answerCallbackQuery",
    { callback_query_id: id, ...(text ? { text, show_alert: alert } : {}) },
    proxyUrl
  );
}

/** Проверка токена при сохранении бота — заодно узнаём его @username. */
export function getMe(token: string, proxyUrl = "") {
  return call<{ id: number; username: string; first_name: string }>(token, "getMe", {}, proxyUrl);
}

export function setWebhook(token: string, url: string, secret: string, proxyUrl = "") {
  return call(
    token,
    "setWebhook",
    { url, secret_token: secret, allowed_updates: ["callback_query"] },
    proxyUrl
  );
}

export function deleteWebhook(token: string, proxyUrl = "") {
  return call(token, "deleteWebhook", {}, proxyUrl);
}

/**
 * Доступен ли Telegram — при желании через указанный прокси.
 *
 * Ходим с заведомо неверным токеном: Телеграм ответит 401, и это ровно то, что
 * нужно — подтверждение, что до API мы дошли. Отказ API означает, что связь
 * ЕСТЬ; её отсутствие приходит как network:true.
 */
export async function checkReachable(proxyUrl = ""): Promise<{ ok: boolean; error?: string }> {
  const r = await call("0:ping", "getMe", {}, proxyUrl);
  if (r.ok) return { ok: true };
  return r.network ? { ok: false, error: r.error } : { ok: true };
}

/** Экранирование под parse_mode: HTML. Имена ресурсов приходят от людей и могут
 *  содержать < и &, которые ломают разметку сообщения. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
