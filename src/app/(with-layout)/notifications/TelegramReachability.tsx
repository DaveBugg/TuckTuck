"use client";

// Доступность Telegram — проверка наверху раздела.
//
// Стоит здесь намеренно: с части хостингов api.telegram.org недоступен, и без
// прокси не заведётся ни один бот, а понять это по ошибке при сохранении бота
// трудно. Связь проверяется до того, как человек начнёт вводить токен.
//
// Сам прокси настраивается в «Настройках системы» — это установочный параметр,
// а не то, что крутят при заведении каждого бота. Отсюда только ссылка туда.

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, Plug, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiJson } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";

type Check = {
  direct: { ok: boolean; error?: string };
  proxy: { ok: boolean; error?: string } | null;
  usable: boolean;
  proxyNeeded: boolean;
};

export default function TelegramReachability() {
  const { t } = useI18n();
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);

  const runCheck = useCallback(
    async (proxyUrl?: string) => {
      setChecking(true);
      try {
        const d = await apiJson("/api/notify/check", "POST", proxyUrl !== undefined ? { proxyUrl } : {});
        setCheck(d);
        return d as Check;
      } catch (e: any) {
        toast.error(e.message);
        return null;
      } finally {
        setChecking(false);
      }
    },
    []
  );

  // Проверяем сразу при открытии раздела: если Telegram недоступен, человек
  // должен узнать это до того, как потратит время на заведение бота.
  useEffect(() => {
    runCheck();
  }, [runCheck]);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Plug className="size-4 text-muted-foreground" />
            {t("tg.title")}
            {check && (
              <Badge variant={check.usable ? "success" : "destructive"}>
                {check.usable ? t("tg.reachable") : t("tg.unreachable")}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {t("tg.desc")}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => runCheck()} disabled={checking}>
          {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {t("tg.check")}
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {check && (
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-center gap-2">
              {check.direct.ok ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" />
              ) : (
                <AlertTriangle className="size-4 shrink-0 text-warning" />
              )}
              <span>
                {t("tg.direct", {
                  status: check.direct.ok
                    ? t("tg.reachable")
                    : check.direct.error || t("tg.unreachable"),
                })}
              </span>
            </div>
            {check.proxy && (
              <div className="flex items-center gap-2">
                {check.proxy.ok ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" />
                ) : (
                  <AlertTriangle className="size-4 shrink-0 text-destructive" />
                )}
                <span>
                  {t("tg.viaProxy", {
                    status: check.proxy.ok
                      ? t("tg.reachable")
                      : check.proxy.error || t("tg.unreachable"),
                  })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Предлагаем прокси только когда он действительно нужен: если прямой
            путь открыт, навязывать лишнюю зависимость незачем. */}
        {check && check.proxyNeeded && !check.proxy?.ok && (
          <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <div>
              <b>{t("tg.warn.title")}</b> {t("tg.warn.text")}
            </div>
            <Button size="sm" variant="outline" className="self-start" asChild>
              <Link href="/settings">{t("tg.setupProxy")}</Link>
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {t("tg.hint")}
        </p>
      </CardContent>
    </Card>
  );
}
