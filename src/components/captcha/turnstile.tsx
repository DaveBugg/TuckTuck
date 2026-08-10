"use client";
// Cloudflare Turnstile — лёгкая обёртка без зависимостей: грузит скрипт CF и
// рендерит виджет. onToken(token) — при успехе; токен одноразовый, поэтому
// наружу торчит reset() через ref для повторного прохождения (шаг 2FA).
import React, { useEffect, useImperativeHandle, useRef, forwardRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
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

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
      },
    }));

    useEffect(() => {
      // капча не настроена (нет sitekey) — не рендерим ничего (fail-open на бэке)
      if (!SITE_KEY) return;
      let cancelled = false;
      loadScript().then(() => {
        if (cancelled || !boxRef.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(boxRef.current, {
          sitekey: SITE_KEY,
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!SITE_KEY) return null;
    return <div ref={boxRef} className="d-flex justify-content-center mb-3" />;
  }
);
