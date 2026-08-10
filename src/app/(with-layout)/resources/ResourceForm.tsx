"use client";

// Форма ресурса. Поля, специфичные для типа, показываются по выбранному kind:
// незачем спрашивать IP у домена и доменное имя у прокси.

import React, { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { cn } from "@/lib/utils";
import { apiJson } from "@/lib/client-api";
import {
  KINDS,
  kindLabel,
  PERIOD_UNITS,
  FIAT_CURRENCIES as FIAT,
  CRYPTO_CURRENCIES as COINS,
  CHAINS,
  type Kind,
} from "@/lib/resources";
import { useI18n } from "@/components/i18n-provider";
import type { Catalog, ResourceRow } from "./types";

const NONE = "__none__"; // Radix Select не принимает "" как значение пункта



const empty = {
  kind: "SERVER" as Kind,
  name: "",
  note: "",
  ip: "",
  port: "",
  url: "",
  domain: "",
  amount: "",
  currency: "USD",
  isCrypto: false,
  chain: "",
  periodValue: "1",
  periodUnit: "MONTH",
  nextPaymentAt: "",
  providerId: "",
  groupId: "",
  isActive: true,
  tagIds: [] as string[],
};

/** Какие типовые поля показывать. Общие поля есть всегда. */
const FIELDS: Record<Kind, Array<"ip" | "port" | "url" | "domain">> = {
  SERVER: ["ip"],
  VPN: ["ip", "port"],
  PROXY: ["ip", "port"],
  DOMAIN: ["domain"],
  SERVICE: ["url"],
};

export default function ResourceForm({
  open,
  row,
  catalog,
  onClose,
  onSaved,
  onCatalogChange,
}: {
  open: boolean;
  row?: ResourceRow;
  catalog: Catalog;
  onClose: () => void;
  onSaved: () => void;
  onCatalogChange: () => void;
}) {
  const { t } = useI18n();
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [newProvider, setNewProvider] = useState("");

  useEffect(() => {
    if (!open) return;
    if (row) {
      setF({
        kind: row.kind,
        name: row.name,
        note: row.note || "",
        ip: row.ip || "",
        port: row.port == null ? "" : String(row.port),
        url: row.url || "",
        domain: row.domain || "",
        amount: row.amount,
        currency: row.currency,
        isCrypto: row.isCrypto,
        chain: row.chain || "",
        periodValue: String(row.periodValue),
        periodUnit: row.periodUnit,
        nextPaymentAt: row.nextPaymentAt,
        providerId: row.provider?.id || "",
        groupId: row.group?.id || "",
        isActive: row.isActive,
        tagIds: row.tags.map(tag => tag.id),
      });
    } else {
      // Новая запись — дата по умолчанию сегодня: чаще заводят то, что уже
      // оплачено, и правят день, а не набирают дату с нуля.
      setF({ ...empty, nextPaymentAt: new Date().toISOString().slice(0, 10) });
    }
  }, [open, row]);

  const set = (k: keyof typeof f, v: any) => setF(p => ({ ...p, [k]: v }));

  const quickAdd = async (type: "tag" | "provider") => {
    const name = (type === "tag" ? newTag : newProvider).trim();
    if (!name) return;
    try {
      const d = await apiJson("/api/catalog", "POST", { type, name });
      if (type === "tag") {
        setNewTag("");
        if (!f.tagIds.includes(d.row.id)) set("tagIds", [...f.tagIds, d.row.id]);
      } else {
        setNewProvider("");
        set("providerId", d.row.id);
      }
      onCatalogChange();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...f, port: f.port === "" ? null : f.port };
      if (row) await apiJson(`/api/resources/${row.id}`, "PATCH", payload);
      else await apiJson("/api/resources", "POST", payload);
      toast.success(row ? t("common.saved") : t("res.toast.added"));
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const shown = FIELDS[f.kind] || [];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{row ? t("res.form.editTitle", { name: row.name }) : t("res.form.newTitle")}</DialogTitle>
            {!row && (
              <DialogDescription>
                {t("res.form.remindersHint")}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <div className="sm:col-span-4">
              <Label htmlFor="rf-kind">{t("res.col.kind")}</Label>
              <Select value={f.kind} onValueChange={v => set("kind", v)}>
                <SelectTrigger id="rf-kind" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map(k => (
                    <SelectItem key={k} value={k}>
                      {kindLabel(k, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-8">
              <Label htmlFor="rf-name">{t("res.form.name")}</Label>
              <Input
                id="rf-name"
                className="mt-1.5"
                value={f.name}
                onChange={e => set("name", e.target.value)}
                placeholder={t("res.form.namePlaceholder")}
                required
              />
            </div>

            {shown.includes("ip") && (
              <div className={shown.includes("port") ? "sm:col-span-8" : "sm:col-span-12"}>
                <Label htmlFor="rf-ip">IP</Label>
                <Input
                  id="rf-ip"
                  className="mt-1.5"
                  value={f.ip}
                  onChange={e => set("ip", e.target.value)}
                  placeholder="10.0.0.1"
                />
              </div>
            )}
            {shown.includes("port") && (
              <div className="sm:col-span-4">
                <Label htmlFor="rf-port">{t("res.form.port")}</Label>
                <Input
                  id="rf-port"
                  className="mt-1.5"
                  type="number"
                  min={1}
                  max={65535}
                  value={f.port}
                  onChange={e => set("port", e.target.value)}
                />
              </div>
            )}
            {shown.includes("domain") && (
              <div className="sm:col-span-12">
                <Label htmlFor="rf-domain">{t("kind.DOMAIN")}</Label>
                <Input
                  id="rf-domain"
                  className="mt-1.5"
                  value={f.domain}
                  onChange={e => set("domain", e.target.value)}
                  placeholder="example.com"
                />
              </div>
            )}
            {shown.includes("url") && (
              <div className="sm:col-span-12">
                <Label htmlFor="rf-url">{t("res.form.billingUrl")}</Label>
                <Input
                  id="rf-url"
                  className="mt-1.5"
                  value={f.url}
                  onChange={e => set("url", e.target.value)}
                  placeholder="https://…"
                />
              </div>
            )}

            <div className="sm:col-span-12 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="rf-crypto"
                  checked={f.isCrypto}
                  onCheckedChange={v =>
                    setF(p => ({
                      ...p,
                      isCrypto: v,
                      // Валюта заведомо не та при переключении типа — подставляем
                      // разумное, иначе в поле останется USD у крипто-оплаты.
                      currency: v ? "USDT" : "USD",
                      chain: v ? p.chain || "TRC20" : "",
                    }))
                  }
                />
                <Label htmlFor="rf-crypto" className="font-normal">
                  {t("res.form.cryptoToggle")}
                </Label>
              </div>
            </div>

            <div className="sm:col-span-3">
              <Label htmlFor="rf-amount">{t("res.col.amount")}</Label>
              <Input
                id="rf-amount"
                className="mt-1.5"
                type="number"
                step={f.isCrypto ? "0.00000001" : "0.01"}
                min="0"
                value={f.amount}
                onChange={e => set("amount", e.target.value)}
                required
              />
            </div>
            <div className="sm:col-span-3">
              <Label>{f.isCrypto ? t("res.form.coin") : t("res.form.currency")}</Label>
              <div className="mt-1.5">
                <SearchSelect
                  value={f.currency}
                  onChange={v => set("currency", v)}
                  options={(f.isCrypto ? COINS : FIAT).map(c => ({
                    value: c,
                    label: c,
                    hint: t(`currency.${c}`),
                  }))}
                  searchPlaceholder={t("common.search")}
                  emptyText={t("common.nothingFound")}
                  ariaLabel={f.isCrypto ? t("res.form.coin") : t("res.form.currency")}
                />
              </div>
            </div>

            {f.isCrypto && (
              <div className="sm:col-span-3">
                <Label>{t("res.form.chain")}</Label>
                <div className="mt-1.5">
                  <SearchSelect
                    value={f.chain || "TRC20"}
                    onChange={v => set("chain", v)}
                    options={CHAINS.map(c => ({ value: c, label: c }))}
                    searchPlaceholder={t("common.search")}
                    emptyText={t("common.nothingFound")}
                    ariaLabel={t("res.form.chain")}
                  />
                </div>
                {/* Сеть важна не для красоты: одна монета в разных сетях
                    платится на разные адреса и с разной комиссией. */}
              </div>
            )}
            <div className="sm:col-span-4">
              <Label>{t("res.form.period")}</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  type="number"
                  min={1}
                  className="w-20"
                  value={f.periodValue}
                  onChange={e => set("periodValue", e.target.value)}
                  aria-label={t("res.form.periodValue")}
                />
                <Select value={f.periodUnit} onValueChange={v => set("periodUnit", v)}>
                  <SelectTrigger aria-label={t("res.form.periodUnit")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_UNITS.map(u => (
                      <SelectItem key={u} value={u}>
                        {t(`period.unit.${u}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="rf-date">{t("res.form.nextPayment")}</Label>
              <Input
                id="rf-date"
                className="mt-1.5"
                type="date"
                value={f.nextPaymentAt}
                onChange={e => set("nextPaymentAt", e.target.value)}
                required
              />
            </div>

            <div className="sm:col-span-6">
              <Label>{t("res.filter.provider")}</Label>
              <Select
                value={f.providerId || NONE}
                onValueChange={v => set("providerId", v === NONE ? "" : v)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("res.form.providerNone")}</SelectItem>
                  {catalog.providers.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-2 flex gap-2">
                <Input
                  className="h-8"
                  value={newProvider}
                  onChange={e => setNewProvider(e.target.value)}
                  placeholder={t("res.form.addProvider")}
                  onKeyDown={e => {
                    // Enter внутри формы отправил бы её целиком — перехватываем.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      quickAdd("provider");
                    }
                  }}
                />
                <Button type="button" variant="outline" size="icon-sm" onClick={() => quickAdd("provider")}>
                  <Plus />
                </Button>
              </div>
            </div>

            <div className="sm:col-span-6">
              <Label>{t("res.form.group")}</Label>
              <Select value={f.groupId || NONE} onValueChange={v => set("groupId", v === NONE ? "" : v)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("res.form.groupNone")}</SelectItem>
                  {catalog.groups.map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-12">
              <Label>{t("res.form.tags")}</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {catalog.tags.length === 0 && (
                  <span className="text-sm text-muted-foreground">{t("res.form.noTags")}</span>
                )}
                {catalog.tags.map(tag => {
                  const on = f.tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() =>
                        set("tagIds", on ? f.tagIds.filter(x => x !== tag.id) : [...f.tagIds, tag.id])
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                        on
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      {on && <Check className="size-3" />}
                      {tag.name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex max-w-80 gap-2">
                <Input
                  className="h-8"
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  placeholder={t("res.form.addTag")}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      quickAdd("tag");
                    }
                  }}
                />
                <Button type="button" variant="outline" size="icon-sm" onClick={() => quickAdd("tag")}>
                  <Plus />
                </Button>
              </div>
            </div>

            <div className="sm:col-span-12">
              <Label htmlFor="rf-note">{t("res.form.note")}</Label>
              <Textarea
                id="rf-note"
                className="mt-1.5"
                rows={2}
                value={f.note}
                onChange={e => set("note", e.target.value)}
                placeholder={t("res.form.notePlaceholder")}
              />
            </div>

            <div className="flex items-center gap-2 sm:col-span-12">
              <Switch id="rf-active" checked={f.isActive} onCheckedChange={v => set("isActive", v)} />
              <Label htmlFor="rf-active" className="font-normal">
                {t("res.form.active")}
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
