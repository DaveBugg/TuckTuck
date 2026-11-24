"use client";

// Точка входа из Telegram WebApp. Загружает официальный скрипт Telegram,
// забирает initData и меняет его на сессию панели.

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { apiJson } from "@/lib/client-api";

const TG_SCRIPT = "https://telegram.org/js/telegram-web-app.js";

export default function TgAppPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<"loading" | "noData" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    const tryAuth = async () => {
      // Telegram WebApp загружается синхронно после скрипта; если скрипт уже
      // есть на странице, initData уже доступен.
      const webApp = (window as any).Telegram?.WebApp;
      const initData = webApp?.initData ?? "";

      if (!initData) {
        if (!cancelled) setState("noData");
        return;
      }

      try {
        await apiJson("/api/auth/telegram", "POST", { initData });
        router.replace("/dashboard");
      } catch (e: any) {
        if (!cancelled) setState("error");
      }
    };

    if (document.querySelector(`script[src="${TG_SCRIPT}"]`)) {
      tryAuth();
    } else {
      const script = document.createElement("script");
      script.src = TG_SCRIPT;
      script.async = true;
      script.onload = tryAuth;
      script.onerror = () => setState("error");
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      {state === "loading" && (
        <>
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t("finance.bot.opening")}
          </p>
        </>
      )}
      {(state === "noData" || state === "error") && (
        <>
          <h1 className="text-xl font-semibold">
            {t("finance.bot.openFromBot")}
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            {t("finance.bot.openFromBotHint")}
          </p>
          <Button variant="outline" onClick={() => router.push("/auth/login")}>
            {t("auth.signIn")}
          </Button>
        </>
      )}
    </div>
  );
}
