"use client";
// Cloudflare Turnstile — лёгкая обёртка без зависимостей: грузит скрипт CF и
// рендерит виджет. onToken(token) — при успехе; токен одноразовый, поэтому
// наружу торчит reset() через ref для повторного прохождения (шаг 2FA).
//
// Ключ сайта берётся с сервера (/api/config), а не из NEXT_PUBLIC_*: сборочная
// переменная означала бы, что поставивший панель готовым образом свой ключ
// задать не может. Пока ключ не пришёл или он пуст — не рендерим ничего, и
// вход работает без капчи (проверка на бэке при пустом секрете fail-open).
import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

function loadScript(): Promise<void> {
  return new Promise(resolve => {
    if (typeof window === "undefined") return resolve();
    if (window.turnstile) return resolve();
    const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

export type TurnstileHandle = { reset: () => void };

export const Turnstile = forwardRef<TurnstileHandle, { onToken: (t: string) => void }>(
  function Turnstile({ onToken }, ref) {
    const boxRef = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const [siteKey, setSiteKey] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
      },
    }));

    useEffect(() => {
      let cancelled = false;
      fetch("/api/config")
        .then(r => r.json())
        .then(d => {
          if (!cancelled) setSiteKey(String(d?.turnstileSiteKey || ""));
        })
        // Настройки не доехали — считаем, что капчи нет: не пускать человека на
        // вход из-за упавшего запроса за ключом было бы хуже.
        .catch(() => setSiteKey(""));
      return () => {
        cancelled = true;
      };
    }, []);

    useEffect(() => {
      if (!siteKey) return;
      let cancelled = false;
      loadScript().then(() => {
        if (cancelled || !boxRef.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(boxRef.current, {
          sitekey: siteKey,
          callback: (t: string) => onToken(t),
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
          theme: "auto",
        });
      });
      return () => {
        cancelled = true;
        if (window.turnstile && widgetId.current) window.turnstile.remove(widgetId.current);
      };
      // onToken меняется на каждый рендер родителя — перерисовывать виджет из-за
      // этого нельзя, он бы сбрасывал уже пройденную проверку.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteKey]);

    if (!siteKey) return null;
    return <div ref={boxRef} className="flex justify-center" />;
  }
);
