// Подстановка строк: интерполяция и множественное число.
//
// Своё, а не библиотека: словарь плоский, форм подстановки две, и весь движок
// умещается в полсотни строк. Тянуть ради этого i18next с его плагинами,
// бэкендами и детекторами — значит добавить мегабайт и слой конфигурации там,
// где хватает Map и Intl.PluralRules.

import { DEFAULT_LOCALE, type Locale } from "./config";
import { ru } from "./ru";
import { en } from "./en";

export type Dict = Record<string, string>;

const DICTS: Record<Locale, Dict> = { ru, en };

export type TParams = Record<string, string | number>;

/**
 * Форма множественного числа по правилам языка.
 *
 * Не «1 → единственное, иначе множественное»: в русском 2 ресурса, 5 ресурсов и
 * 21 ресурс — три разные формы, и наивное сравнение с единицей пишет «21
 * ресурсов». Intl знает правила для обоих языков и не требует их держать в
 * голове.
 */
function pluralKey(locale: Locale, key: string, n: number): string {
  const form = new Intl.PluralRules(locale).select(n); // one | few | many | other
  return `${key}_${form}`;
}

export type TFunc = (key: string, params?: TParams) => string;

export function makeT(locale: Locale): TFunc {
  const dict = DICTS[locale] || DICTS[DEFAULT_LOCALE];
  const fallback = DICTS[DEFAULT_LOCALE];

  return (key, params) => {
    let template: string | undefined;

    // Есть count — сначала ищем форму по числу, и только потом обычный ключ:
    // так одна и та же строка работает и с формами, и без них.
    if (params && typeof params.count === "number") {
      const pk = pluralKey(locale, key, params.count);
      template = dict[pk] ?? fallback[pluralKey(DEFAULT_LOCALE, key, params.count)];
    }
    template ??= dict[key] ?? fallback[key];

    // Ключ не найден — показываем сам ключ. Пустая строка выглядела бы как
    // сломанная вёрстка, а ключ сразу говорит, чего не хватает в словаре.
    if (template === undefined) return key;

    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (m, name) =>
      params[name] === undefined ? m : String(params[name])
    );
  };
}

/** Локаль для Intl: даты и числа. */
export function intlLocale(locale: Locale): string {
  return locale === "ru" ? "ru-RU" : "en-US";
}

/** Дата и время в привычном для языка виде. */
export function formatDateTime(v: string | number | Date, locale: Locale): string {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(intlLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Только часы и минуты: «обновлено в 12:34» — дата там лишний шум. */
export function formatTime(v: string | number | Date, locale: Locale): string {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(intlLocale(locale), { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(v: string | number | Date, locale: Locale): string {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(intlLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatNumber(v: number, locale: Locale, opts?: Intl.NumberFormatOptions): string {
  return v.toLocaleString(intlLocale(locale), opts);
}
