"use client";

// Настройки системы (только ADMIN): прокси до Telegram, часовой пояс, срок
// хранения метрик, валюта итога.
//
// Собраны на одной странице намеренно: всё это установочные параметры, которые
// трогают раз в жизни, и разносить их по разделам значило бы заставлять искать.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BellOff, Clock, Coins, Database, Languages, Loader2, Plug, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchSelect } from "@/components/ui/search-select";
import { cn } from "@/lib/utils";
import { apiFetch, apiJson } from "@/lib/client-api";
import { RETENTION_PRESETS } from "@/lib/settings-config";
import { CURRENCIES } from "@/lib/resources";
import { useI18n } from "@/components/i18n-provider";
import { LOCALES, LOCALE_LABEL } from "@/lib/i18n/config";

type Settings = {
  timezone: string;
  metricsRetentionDays: number;
  displayCurrency: string;
  notifyLocale: string;
  /** Окно, в которое можно писать в Телеграм. Равные значения — круглосуточно. */
  notifyFromHour: number;
  notifyToHour: number;
  turnstileSiteKey: string;
  /** Только факт: сам секрет наружу не отдаётся. */
  turnstileSecretSet: boolean;
  turnstileEnvSet: boolean;
  proxy: string;
  proxySet: boolean;
  envProxySet: boolean;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

// Список поясов берём у самого движка: свой перечень пришлось бы поддерживать
// вручную, и он всё равно отстал бы от tzdata.
function zones(): string[] {
  const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  try {
    return anyIntl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

/** Текущее смещение пояса — «GMT+3». Ищут пояса и по нему тоже. */
function offsetOf(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    return parts.find(p => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

export default function SettingsPage() {
  const { t } = useI18n();
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [proxyDraft, setProxyDraft] = useState("");
  const [editProxy, setEditProxy] = useState(false);

  // Смещения считаются один раз: четыреста поясов через Intl на каждый рендер
  // подвешивают открытие списка.
  const zoneOptions = useMemo(() => {
    const list = zones();
    const all = list.length ? list : ["UTC"];
    return all.map(z => ({ value: z, label: z, hint: offsetOf(z) }));
  }, []);

  const load = useCallback(() => {
    apiFetch("/api/settings")
      .then(setS)
      .catch(e => toast.error(e.message));
  }, []);
  useEffect(load, [load]);

  const patch = async (body: Record<string, unknown>, ok?: string) => {
    setSaving(true);
    try {
      const d = await apiJson("/api/settings", "PUT", body);
      setS(d);
      toast.success(ok ?? t("common.saved"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!s) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="size-4 text-muted-foreground" />
            {t("settings.proxy.title")}
          </CardTitle>
          <CardDescription>
            {t("settings.proxy.desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {!editProxy && (
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs">
                {s.proxySet
                  ? s.proxy
                  : s.envProxySet
                    ? t("settings.proxy.fromEnv")
                    : t("settings.proxy.none")}
              </code>
              <Button variant="outline" size="sm" onClick={() => setEditProxy(true)}>
                {t("common.edit")}
              </Button>
            </div>
          )}
          {editProxy && (
            <>
              <Input
                className="font-mono text-xs"
                value={proxyDraft}
                onChange={e => setProxyDraft(e.target.value)}
                placeholder="socks5://user:pass@host:port"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.proxy.hint")}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={async () => {
                    await patch({ proxyUrl: proxyDraft.trim() }, t("settings.proxy.saved"));
                    setEditProxy(false);
                    setProxyDraft("");
                  }}
                >
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  {t("common.save")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditProxy(false);
                    setProxyDraft("");
                  }}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            {t("settings.tz.title")}
          </CardTitle>
          <CardDescription>
            {t("settings.tz.desc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm">
            <SearchSelect
              value={s.timezone}
              onChange={v => patch({ timezone: v })}
              // Сохранённый пояс подставляем, даже если движок его не знает:
              // иначе список выглядел бы как «ничего не выбрано».
              options={
                zoneOptions.some(z => z.value === s.timezone)
                  ? zoneOptions
                  : [{ value: s.timezone, label: s.timezone }, ...zoneOptions]
              }
              searchPlaceholder={t("settings.tz.search")}
              emptyText={t("common.nothingFound")}
              ariaLabel={t("settings.tz.title")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="size-4 text-muted-foreground" />
            {t("settings.quiet.title")}
          </CardTitle>
          <CardDescription>{t("settings.quiet.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label>{t("settings.quiet.from")}</Label>
              <div className="mt-1.5 w-28">
                <SearchSelect
                  value={String(s.notifyFromHour)}
                  onChange={v => patch({ notifyFromHour: Number(v) })}
                  options={HOURS.map(h => ({ value: String(h), label: hh(h) }))}
                  searchPlaceholder={t("common.search")}
                  emptyText={t("common.nothingFound")}
                  ariaLabel={t("settings.quiet.from")}
                />
              </div>
            </div>
            <div>
              <Label>{t("settings.quiet.to")}</Label>
              <div className="mt-1.5 w-28">
                <SearchSelect
                  value={String(s.notifyToHour)}
                  onChange={v => patch({ notifyToHour: Number(v) })}
                  options={HOURS.map(h => ({ value: String(h), label: hh(h) }))}
                  searchPlaceholder={t("common.search")}
                  emptyText={t("common.nothingFound")}
                  ariaLabel={t("settings.quiet.to")}
                />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mb-0.5"
              onClick={() => patch({ notifyFromHour: 0, notifyToHour: 0 })}
            >
              {t("settings.quiet.always")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {s.notifyFromHour === s.notifyToHour
              ? t("settings.quiet.stateAlways")
              : t("settings.quiet.stateWindow", {
                  from: hh(s.notifyFromHour),
                  to: hh(s.notifyToHour),
                  tz: s.timezone,
                })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4 text-muted-foreground" />
            {t("settings.retention.title")}
          </CardTitle>
          <CardDescription>
            {t("settings.retention.desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {RETENTION_PRESETS.map(d => (
              <Button
                key={d}
                size="sm"
                variant={s.metricsRetentionDays === d ? "default" : "outline"}
                onClick={() =>
                  patch({ metricsRetentionDays: d }, t("settings.retention.saved", { count: d }))
                }
              >
                {t("settings.retention.days", { count: d })}
              </Button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="ret">{t("settings.retention.custom")}</Label>
              <Input
                id="ret"
                className="mt-1.5 w-32 tabular"
                type="number"
                min={1}
                max={730}
                defaultValue={s.metricsRetentionDays}
                onBlur={e => {
                  const n = Number(e.target.value);
                  if (n !== s.metricsRetentionDays) patch({ metricsRetentionDays: n });
                }}
              />
            </div>
            <span className="pb-2 text-sm text-muted-foreground">
              {t("settings.retention.current", { count: s.metricsRetentionDays })}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="size-4 text-muted-foreground" />
            {t("settings.currency.title")}
          </CardTitle>
          <CardDescription>
            {t("settings.currency.desc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-56">
            {/* Список, а не свободный ввод: опечатка в коде валюты не находит
                курса, и ресурс молча выпадает из общего итога. */}
            <SearchSelect
              value={s.displayCurrency}
              onChange={v => patch({ displayCurrency: v })}
              options={CURRENCIES.map(c => ({ value: c, label: c, hint: t(`currency.${c}`) }))}
              searchPlaceholder={t("common.search")}
              emptyText={t("common.nothingFound")}
              ariaLabel={t("settings.currency.title")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            {t("settings.captcha.title")}
          </CardTitle>
          <CardDescription>{t("settings.captcha.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div>
            <Label htmlFor="ts-site">{t("settings.captcha.siteKey")}</Label>
            <Input
              id="ts-site"
              className="mt-1.5 max-w-md font-mono text-xs"
              defaultValue={s.turnstileSiteKey}
              placeholder="0x4AAAAAAA…"
              onBlur={e => {
                const v = e.target.value.trim();
                if (v !== s.turnstileSiteKey) patch({ turnstileSiteKey: v });
              }}
            />
          </div>
          <div>
            <Label htmlFor="ts-secret">{t("settings.captcha.secretKey")}</Label>
            <Input
              id="ts-secret"
              className="mt-1.5 max-w-md font-mono text-xs"
              type="password"
              autoComplete="new-password"
              placeholder={
                s.turnstileSecretSet
                  ? t("settings.captcha.secretSet")
                  : s.turnstileEnvSet
                    ? t("settings.proxy.fromEnv")
                    : t("settings.captcha.secretEmpty")
              }
              onBlur={e => {
                const v = e.target.value;
                // Пустое поле не трогает сохранённый секрет: иначе любое
                // касание поля стирало бы капчу.
                if (v) {
                  patch({ turnstileSecretKey: v.trim() }, t("settings.captcha.saved"));
                  e.target.value = "";
                }
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("settings.captcha.hint")}</p>
          </div>
          {s.turnstileSecretSet && (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => patch({ turnstileSecretKey: "", turnstileSiteKey: "" })}
            >
              {t("settings.captcha.disable")}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="size-4 text-muted-foreground" />
            {t("settings.notifyLocale.title")}
          </CardTitle>
          <CardDescription>{t("settings.notifyLocale.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {LOCALES.map(l => (
            <Button
              key={l}
              size="sm"
              variant={s.notifyLocale === l ? "default" : "outline"}
              onClick={() => patch({ notifyLocale: l })}
            >
              {LOCALE_LABEL[l]}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
