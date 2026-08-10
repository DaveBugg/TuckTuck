// Язык на сервере: серверные компоненты и роуты API.
//
// Только кука и заголовок — в БД отсюда не ходим. Язык нужен на каждом экране и
// в каждом ответе, и поход в базу за ним превратился бы в самый частый запрос
// системы. В базу за языком ходят ровно один раз, при входе, и результат
// кладётся в куку (см. роут логина).

import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  resolveLocale,
  type Locale,
} from "./config";
import { makeT, type TFunc } from "./translate";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  if (fromCookie) return resolveLocale(fromCookie);

  const h = await headers();
  return localeFromAcceptLanguage(h.get("accept-language")) ?? DEFAULT_LOCALE;
}

export async function getT(): Promise<TFunc> {
  return makeT(await getLocale());
}

/**
 * Язык для ответа API по заголовкам запроса.
 *
 * Отдельно от getLocale(), потому что в роутах Request под рукой, а обращение к
 * общему хранилищу заголовков лишнее.
 */
export function localeFromRequest(req: Request): Locale {
  const raw = req.headers.get("cookie") || "";
  const m = new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`).exec(raw);
  if (m) return resolveLocale(decodeURIComponent(m[1]));
  return localeFromAcceptLanguage(req.headers.get("accept-language")) ?? DEFAULT_LOCALE;
}

/** t() для ответа API: сообщения об ошибках уходят на языке пользователя. */
export function tForRequest(req: Request): TFunc {
  return makeT(localeFromRequest(req));
}
