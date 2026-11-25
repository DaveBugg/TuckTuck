"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SearchSelect } from "@/components/ui/search-select";
import { DatePicker } from "@/components/ui/date-picker";
import { apiFetch, apiJson } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import { CURRENCIES } from "@/lib/resources";
import type { RecurringRow } from "./types";

const NONE = "__none__";
const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

export default function RecurringDialog({
  open,
  onClose,
  onSaved,
  row,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  row?: RecurringRow;
}) {
  const { t } = useI18n();
  const isEdit = Boolean(row);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [scope, setScope] = useState<"TEAM" | "PROJECT" | "MEMBER">("TEAM");
  const [projectId, setProjectId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [frequency, setFrequency] =
    useState<(typeof FREQUENCIES)[number]>("MONTHLY");
  const [interval, setInterval] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("");
  const [nextRunAt, setNextRunAt] = useState("");
  const [active, setActive] = useState(true);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>(
    []
  );

  useEffect(() => {
    if (!open) return;
    apiFetch("/api/finance/projects?archived=false&pageSize=1000")
      .then((d: { rows: Array<{ id: string; name: string }> }) =>
        setProjects(d.rows)
      )
      .catch(() => setProjects([]));
    apiFetch("/api/finance/members?active=true&pageSize=1000")
      .then((d: { rows: Array<{ id: string; name: string }> }) =>
        setMembers(d.rows)
      )
      .catch(() => setMembers([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setTitle(row?.title ?? "");
    setAmount(row?.amount ?? "");
    setCurrency(row?.currency ?? "USD");
    setScope(row?.scope ?? "TEAM");
    setProjectId(row?.projectId ?? "");
    setMemberId(row?.memberId ?? "");
    setFrequency(row?.frequency ?? "MONTHLY");
    setInterval(String(row?.interval ?? 1));
    setDayOfMonth(row?.dayOfMonth ? String(row.dayOfMonth) : "");
    setNextRunAt(
      row?.nextRunAt
        ? new Date(row.nextRunAt).toLocaleDateString("en-CA")
        : new Date().toLocaleDateString("en-CA")
    );
    setActive(row?.active ?? true);
    setDescription(row?.description ?? "");
  }, [open, row]);

  const showDayOfMonth = useMemo(
    () => frequency === "MONTHLY" || frequency === "YEARLY",
    [frequency]
  );

  const canSubmit =
    title.trim() &&
    Number(amount) > 0 &&
    Number(interval) >= 1 &&
    (scope !== "PROJECT" || projectId) &&
    (scope !== "MEMBER" || memberId) &&
    (!showDayOfMonth ||
      dayOfMonth === "" ||
      (Number(dayOfMonth) >= 1 && Number(dayOfMonth) <= 31));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        amount: Number(amount),
        currency,
        scope,
        frequency,
        interval: Number(interval),
        nextRunAt,
        active,
        projectId: scope === "PROJECT" ? projectId : null,
        memberId: scope === "MEMBER" ? memberId : null,
      };
      if (showDayOfMonth && dayOfMonth !== "") {
        payload.dayOfMonth = Number(dayOfMonth);
      } else {
        payload.dayOfMonth = null;
      }

      if (isEdit && row) {
        await apiJson(`/api/finance/recurring/${row.id}`, "PATCH", payload);
        toast.success(t("common.saved"));
      } else {
        await apiJson("/api/finance/recurring", "POST", payload);
        toast.success(t("finance.recurring.toast.created"));
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const scopeOptions = [
    { value: "TEAM", label: t("finance.operation.scope.team") },
    { value: "PROJECT", label: t("finance.operation.scope.project") },
    { value: "MEMBER", label: t("finance.operation.scope.member") },
  ];

  const frequencyOptions = FREQUENCIES.map(f => ({
    value: f,
    label: t(`finance.recurring.frequency.${f}`),
  }));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {isEdit
                ? t("finance.recurring.editTitle")
                : t("finance.recurring.newTitle")}
            </DialogTitle>
          </DialogHeader>

          <div>
            <Label htmlFor="rec-title">{t("finance.operation.name")}</Label>
            <Input
              id="rec-title"
              className="mt-1.5"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rec-amount">
                {t("finance.operation.amount")}
              </Label>
              <Input
                id="rec-amount"
                className="mt-1.5"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>{t("finance.operation.currency")}</Label>
              <div className="mt-1.5">
                <SearchSelect
                  value={currency}
                  onChange={setCurrency}
                  options={CURRENCIES.map(c => ({
                    value: c,
                    label: c,
                    hint: t(`currency.${c}`),
                  }))}
                  searchPlaceholder={t("common.search")}
                  emptyText={t("common.nothingFound")}
                  ariaLabel={t("finance.operation.currency")}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("finance.operation.scope")}</Label>
              <div className="mt-1.5">
                <SearchSelect
                  value={scope}
                  onChange={v => setScope(v as typeof scope)}
                  options={scopeOptions}
                  ariaLabel={t("finance.operation.scope")}
                />
              </div>
            </div>
            {scope === "PROJECT" && (
              <div>
                <Label>{t("finance.operation.project")}</Label>
                <div className="mt-1.5">
                  <SearchSelect
                    value={projectId || NONE}
                    onChange={v => setProjectId(v === NONE ? "" : v)}
                    options={[
                      { value: NONE, label: `— ${t("common.search")} —` },
                      ...projects.map(p => ({ value: p.id, label: p.name })),
                    ]}
                    searchPlaceholder={t("common.search")}
                    emptyText={t("common.nothingFound")}
                    ariaLabel={t("finance.operation.project")}
                  />
                </div>
              </div>
            )}
            {scope === "MEMBER" && (
              <div>
                <Label>{t("finance.operation.member")}</Label>
                <div className="mt-1.5">
                  <SearchSelect
                    value={memberId || NONE}
                    onChange={v => setMemberId(v === NONE ? "" : v)}
                    options={[
                      { value: NONE, label: `— ${t("common.search")} —` },
                      ...members.map(m => ({ value: m.id, label: m.name })),
                    ]}
                    searchPlaceholder={t("common.search")}
                    emptyText={t("common.nothingFound")}
                    ariaLabel={t("finance.operation.member")}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("finance.recurring.frequency")}</Label>
              <div className="mt-1.5">
                <SearchSelect
                  value={frequency}
                  onChange={v => setFrequency(v as typeof frequency)}
                  options={frequencyOptions}
                  ariaLabel={t("finance.recurring.frequency")}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="rec-interval">
                {t("finance.recurring.interval")}
              </Label>
              <Input
                id="rec-interval"
                className="mt-1.5"
                type="number"
                min="1"
                step="1"
                value={interval}
                onChange={e => setInterval(e.target.value)}
                required
              />
            </div>
          </div>

          {showDayOfMonth && (
            <div>
              <Label htmlFor="rec-day">
                {t("finance.recurring.dayOfMonth")}
              </Label>
              <Input
                id="rec-day"
                className="mt-1.5"
                type="number"
                min="1"
                max="31"
                step="1"
                value={dayOfMonth}
                onChange={e => setDayOfMonth(e.target.value)}
                placeholder={t("finance.recurring.dayOfMonthHint")}
              />
            </div>
          )}

          <div>
            <Label htmlFor="rec-start">
              {t("finance.recurring.startDate")}
            </Label>
            <DatePicker
              id="rec-start"
              className="mt-1.5"
              value={nextRunAt}
              onChange={setNextRunAt}
              placeholder={t("finance.recurring.startDate")}
            />
          </div>

          <div>
            <Label htmlFor="rec-desc">
              {t("finance.operation.description")}
            </Label>
            <Textarea
              id="rec-desc"
              className="mt-1.5"
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
            <Label htmlFor="rec-active" className="cursor-pointer">
              {t("finance.recurring.active")}
            </Label>
            <Switch
              id="rec-active"
              checked={active}
              onCheckedChange={setActive}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !canSubmit}>
              {busy
                ? t("common.saving")
                : isEdit
                  ? t("common.save")
                  : t("common.create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
