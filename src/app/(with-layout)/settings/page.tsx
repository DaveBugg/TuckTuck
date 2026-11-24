"use client";

// Настройки системы (только ADMIN): прокси до Telegram, часовой пояс, срок
// хранения метрик, валюта итога.
//
// Собраны на одной странице намеренно: всё это установочные параметры, которые
// трогают раз в жизни, и разносить их по разделам значило бы заставлять искать.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellOff,
  Clock,
  Coins,
  Database,
  Languages,
  Loader2,
  Plug,
  Save,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchSelect } from "@/components/ui/search-select";
import { Switch } from "@/components/ui/switch";
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

type FinanceSettings = {
  financeQuickCurrencies: string[];
  financeQuickTags: string[];
  financierUserId: string | null;
  financierOptions: { id: string; name: string; telegramUserId: string }[];
};

type TelegramGroup = {
  id: string;
  chatId: string;
  title: string;
  active: boolean;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

// Список поясов берём у самого движка: свой перечень пришлось бы поддерживать
// вручную, и он всё равно отстал бы от tzdata.
function zones(): string[] {
  const anyIntl = Intl as unknown as {
    supportedValuesOf?: (k: string) => string[];
  };
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

  // ── Finance Board / Telegram bot settings ──
  const [finance, setFinance] = useState<FinanceSettings | null>(null);
  const [financeSaving, setFinanceSaving] = useState(false);
  const [groups, setGroups] = useState<TelegramGroup[] | null>(null);
  const [currencyDraft, setCurrencyDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");

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

  const loadFinance = useCallback(() => {
    apiFetch("/api/settings/finance")
      .then(setFinance)
      .catch(e => toast.error(e.message));
  }, []);
  useEffect(loadFinance, [loadFinance]);

  const loadGroups = useCallback(() => {
    apiFetch("/api/settings/telegram-groups")
      .then(d => setGroups(d.rows))
      .catch(e => toast.error(e.message));
  }, []);
  useEffect(loadGroups, [loadGroups]);

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

  const patchFinance = async (body: Record<string, unknown>, ok?: string) => {
    setFinanceSaving(true);
    try {
      const d = await apiJson("/api/settings/finance", "PATCH", body);
      setFinance(d);
      toast.success(ok ?? t("common.saved"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setFinanceSaving(false);
    }
  };

  const toggleGroup = async (g: TelegramGroup) => {
    try {
      const d = await apiJson(
        `/api/settings/telegram-groups/${g.id}/approve`,
        "POST",
        { active: !g.active }
      );
      setGroups(prev =>
        prev
          ? prev.map(x => (x.id === d.id ? { ...x, active: d.active } : x))
          : prev
      );
      toast.success(t("common.saved"));
    } catch (e: any) {
      toast.error(e.message);
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
        <h1 className="text-xl font-semibold tracking-tight">
          {t("settings.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("settings.subtitle")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="size-4 text-muted-foreground" />
            {t("settings.proxy.title")}
          </CardTitle>
          <CardDescription>{t("settings.proxy.desc")}</CardDescription>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditProxy(true)}
              >
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
                    await patch(
                      { proxyUrl: proxyDraft.trim() },
                      t("settings.proxy.saved")
                    );
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
          <CardDescription>{t("settings.tz.desc")}</CardDescription>
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
          <CardDescription>{t("settings.retention.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {RETENTION_PRESETS.map(d => (
              <Button
                key={d}
                size="sm"
                variant={s.metricsRetentionDays === d ? "default" : "outline"}
                onClick={() =>
                  patch(
                    { metricsRetentionDays: d },
                    t("settings.retention.saved", { count: d })
                  )
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
                  if (n !== s.metricsRetentionDays)
                    patch({ metricsRetentionDays: n });
                }}
              />
            </div>
            <span className="pb-2 text-sm text-muted-foreground">
              {t("settings.retention.current", {
                count: s.metricsRetentionDays,
              })}
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
          <CardDescription>{t("settings.currency.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-56">
            {/* Список, а не свободный ввод: опечатка в коде валюты не находит
                курса, и ресурс молча выпадает из общего итога. */}
            <SearchSelect
              value={s.displayCurrency}
              onChange={v => patch({ displayCurrency: v })}
              options={CURRENCIES.map(c => ({
                value: c,
                label: c,
                hint: t(`currency.${c}`),
              }))}
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
                  patch(
                    { turnstileSecretKey: v.trim() },
                    t("settings.captcha.saved")
                  );
                  e.target.value = "";
                }
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("settings.captcha.hint")}
            </p>
          </div>
          {s.turnstileSecretSet && (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                patch({ turnstileSecretKey: "", turnstileSiteKey: "" })
              }
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="size-4 text-muted-foreground" />
            {t("finance.settings.title")}
          </CardTitle>
          <CardDescription>{t("finance.settings.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {finance === null && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-9 w-48" />
            </div>
          )}

          {finance && (
            <>
              <div>
                <Label className="mb-2 block">
                  {t("finance.settings.currencies")}
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  {finance.financeQuickCurrencies.map(c => (
                    <Badge key={c} variant="secondary" className="gap-1">
                      {c}
                      <button
                        className="ml-1 rounded-full hover:text-destructive"
                        onClick={() =>
                          patchFinance({
                            financeQuickCurrencies:
                              finance.financeQuickCurrencies.filter(
                                x => x !== c
                              ),
                          })
                        }
                        disabled={financeSaving}
                        aria-label={t("common.delete")}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                  <div className="flex items-center gap-2">
                    <Input
                      className="w-24 font-mono text-xs uppercase"
                      value={currencyDraft}
                      onChange={e => setCurrencyDraft(e.target.value)}
                      placeholder="USD"
                      maxLength={10}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          const c = currencyDraft.trim().toUpperCase();
                          if (!c) return;
                          patchFinance({
                            financeQuickCurrencies: [
                              ...finance.financeQuickCurrencies,
                              c,
                            ],
                          });
                          setCurrencyDraft("");
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        financeSaving ||
                        !currencyDraft.trim() ||
                        finance.financeQuickCurrencies.length >= 12
                      }
                      onClick={() => {
                        const c = currencyDraft.trim().toUpperCase();
                        if (!c) return;
                        patchFinance({
                          financeQuickCurrencies: [
                            ...finance.financeQuickCurrencies,
                            c,
                          ],
                        });
                        setCurrencyDraft("");
                      }}
                    >
                      {t("common.add")}
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">
                  {t("finance.settings.tags")}
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  {finance.financeQuickTags.map(tag => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button
                        className="ml-1 rounded-full hover:text-destructive"
                        onClick={() =>
                          patchFinance({
                            financeQuickTags: finance.financeQuickTags.filter(
                              x => x !== tag
                            ),
                          })
                        }
                        disabled={financeSaving}
                        aria-label={t("common.delete")}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                  <div className="flex items-center gap-2">
                    <Input
                      className="w-32 text-xs"
                      value={tagDraft}
                      onChange={e => setTagDraft(e.target.value)}
                      placeholder={t("finance.settings.tagPlaceholder")}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          const tag = tagDraft.trim();
                          if (!tag) return;
                          patchFinance({
                            financeQuickTags: [
                              ...finance.financeQuickTags,
                              tag,
                            ],
                          });
                          setTagDraft("");
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        financeSaving ||
                        !tagDraft.trim() ||
                        finance.financeQuickTags.length >= 8
                      }
                      onClick={() => {
                        const tag = tagDraft.trim();
                        if (!tag) return;
                        patchFinance({
                          financeQuickTags: [...finance.financeQuickTags, tag],
                        });
                        setTagDraft("");
                      }}
                    >
                      {t("common.add")}
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">
                  {t("finance.settings.financier")}
                </Label>
                <div className="max-w-sm">
                  <SearchSelect
                    value={finance.financierUserId ?? ""}
                    onChange={v =>
                      patchFinance({
                        financierUserId: v || null,
                      })
                    }
                    options={[
                      { value: "", label: t("finance.settings.noFinancier") },
                      ...finance.financierOptions.map(u => ({
                        value: u.id,
                        label: `${u.name} (ID ${u.telegramUserId})`,
                      })),
                    ]}
                    searchPlaceholder={t("common.search")}
                    emptyText={t("common.nothingFound")}
                    ariaLabel={t("finance.settings.financier")}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">
                  {t("finance.settings.groups")}
                </Label>
                {groups === null && <Skeleton className="h-20 w-full" />}
                {groups?.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("finance.settings.groupsEmpty")}
                  </p>
                )}
                {groups && groups.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {groups.map(g => (
                      <div
                        key={g.id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {g.title || `ID ${g.chatId}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {g.chatId}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {g.active
                              ? t("common.enable")
                              : t("common.disable")}
                          </span>
                          <Switch
                            checked={g.active}
                            onCheckedChange={() => toggleGroup(g)}
                            aria-label={t("finance.settings.groups")}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
