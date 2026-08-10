"use client";

// Язык на клиенте.
//
// Значение приходит с сервера пропсом — тем самым, что уже использован при
// рендере разметки. Если бы клиент определял язык сам, первый кадр приезжал бы
// на одном языке, а после гидратации переключался на другой; React такое
// расхождение считает ошибкой, и не зря — это видно глазом.

import React, { createContext, useCallback, useContext, useMemo } from "react";
import Cookies from "js-cookie";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  resolveLocale,
  type Locale,
} from "@/lib/i18n/config";
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatNumber,
  makeT,
  type TFunc,
} from "@/lib/i18n/translate";

type Ctx = {
  locale: Locale;
  t: TFunc;
  setLocale: (l: Locale) => void;
  fmtDate: (v: string | number | Date) => string;
  fmtDateTime: (v: string | number | Date) => string;
  fmtTime: (v: string | number | Date) => string;
  fmtNum: (v: number, opts?: Intl.NumberFormatOptions) => string;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo<Ctx>(() => {
    const t = makeT(locale);
    return {
      locale,
      t,
      setLocale: (l: Locale) => {
        Cookies.set(LOCALE_COOKIE, l, { expires: LOCALE_COOKIE_MAX_AGE / 86400, path: "/" });
        // Полная перезагрузка, а не router.refresh(): язык участвует в атрибуте
        // lang у <html> и в серверном рендере всех страниц сразу. Мягкое
        // обновление оставило бы часть дерева на прежнем языке.
        window.location.reload();
      },
      fmtDate: v => formatDate(v, locale),
      fmtDateTime: v => formatDateTime(v, locale),
      fmtTime: v => formatTime(v, locale),
      fmtNum: (v, opts) => formatNumber(v, locale, opts),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Доступ к языку и подстановке.
 *
 * Вне провайдера возвращает русский, а не падает: компоненты вроде тостов
 * рендерятся из порталов, и уронить интерфейс из-за отсутствующего контекста
 * было бы худшим из вариантов.
 */
export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  return (
    ctx ?? {
      locale: DEFAULT_LOCALE,
      t: makeT(DEFAULT_LOCALE),
      setLocale: () => {},
      fmtDate: v => formatDate(v, DEFAULT_LOCALE),
      fmtDateTime: v => formatDateTime(v, DEFAULT_LOCALE),
      fmtTime: v => formatTime(v, DEFAULT_LOCALE),
      fmtNum: (v, opts) => formatNumber(v, DEFAULT_LOCALE, opts),
    }
  );
}

/** Короткая форма для самого частого случая. */
export function useT(): TFunc {
  return useI18n().t;
}

/** Синхронизировать куку с языком, который вернул профиль пользователя. */
export function syncLocaleCookie(userLocale: unknown): void {
  const l = resolveLocale(userLocale);
  if (Cookies.get(LOCALE_COOKIE) === l) return;
  Cookies.set(LOCALE_COOKIE, l, { expires: LOCALE_COOKIE_MAX_AGE / 86400, path: "/" });
}
