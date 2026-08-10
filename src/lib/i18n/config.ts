// Языки интерфейса и правила выбора языка.
//
// Порядок выбора намеренно такой: кука → пользователь в БД → заголовок браузера
// → английский. Кука стоит первой, чтобы обычный рендер страницы не ходил в базу
// ради одного поля: язык нужен КАЖДОМУ экрану, и запрос за ним был бы самым
// частым в системе. В базе язык всё равно хранится — иначе он терялся бы при
// входе с другого устройства.

export const LOCALES = ["ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];

// Английский, а не русский: панель ставят на свой сервер люди из разных мест,
// и язык по умолчанию должен быть тем, который поймут все. Русский выбирается
// заголовком браузера, а дальше — куком и полем пользователя.
export const DEFAULT_LOCALE: Locale = "en";

/** Кука языка. Читаемая: её ставит и сервер, и клиент при переключении. */
export const LOCALE_COOKIE = "tt_lang";
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** Названия — каждое на своём языке: так их узнают, не зная текущего. */
export const LOCALE_LABEL: Record<Locale, string> = {
  ru: "Русский",
  en: "English",
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** Привести что угодно к поддерживаемому языку. */
export function resolveLocale(v: unknown): Locale {
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/**
 * Язык из заголовка Accept-Language.
 *
 * Разбираем сами, без библиотеки: языков всего два, а нормальный парсер
 * q-весов ради этого — лишняя зависимость. Берём первый подходящий по порядку
 * перечисления, потому что браузеры и так шлют их по убыванию предпочтения.
 */
export function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return null;
}
