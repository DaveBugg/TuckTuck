"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
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
import { apiFetch, apiJson } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import { CURRENCIES } from "@/lib/resources";
import { cn } from "@/lib/utils";
import type { ExpenseRow, IncomeRow, ProjectDetail } from "./types";

const NONE = "__none__";

type OpType = "expense" | "payout" | "income";
type Scope = "TEAM" | "PROJECT" | "MEMBER";

type OperationRow = ExpenseRow | IncomeRow;

function isExpense(r: OperationRow): r is ExpenseRow {
  return "kind" in r;
}

function rowType(r?: OperationRow): OpType {
  if (!r) return "expense";
  if (isExpense(r)) return r.kind === "PAYOUT" ? "payout" : "expense";
  return "income";
}

function rowScope(r?: OperationRow): Scope {
  if (!r) return "TEAM";
  if (isExpense(r)) return r.scope;
  return r.projectId ? "PROJECT" : "TEAM";
}

export default function OperationDialog({
  open,
  onClose,
  onSaved,
  displayCurrency,
  initialType = "expense",
  row,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  displayCurrency: string;
  initialType?: OpType;
  row?: OperationRow;
}) {
  const { t } = useI18n();
  const isEdit = Boolean(row);
  const [type, setType] = useState<OpType>(initialType);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [scope, setScope] = useState<Scope>("TEAM");
  const [projectId, setProjectId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [distribute, setDistribute] = useState(true);
  const [busy, setBusy] = useState(false);

  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(
    null
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
    const baseType = isEdit ? rowType(row) : initialType;
    const baseScope = isEdit
      ? rowScope(row)
      : initialType === "payout"
        ? "MEMBER"
        : "TEAM";
    setType(baseType);
    setTitle(row?.title ?? "");
    setAmount(row?.amount ?? "");
    setCurrency(row?.currency ?? "USD");
    setScope(baseScope);
    setProjectId(
      isEdit && row && !isExpense(row) && row.projectId ? row.projectId : ""
    );
    setMemberId(
      isEdit && row && isExpense(row) && row.memberId ? row.memberId : ""
    );
    setDate(row?.date ?? new Date().toISOString().slice(0, 10));
    setDescription(row?.description ?? "");
    setTags(isEdit && row && isExpense(row) ? row.tags : []);
    setTagInput("");
    setDistribute(true);
    setProjectDetail(null);
  }, [open, row, initialType, isEdit]);

  useEffect(() => {
    if (scope === "PROJECT" && projectId && type === "income") {
      apiFetch(`/api/finance/projects/${projectId}`)
        .then((d: { row: ProjectDetail }) => setProjectDetail(d.row))
        .catch(() => setProjectDetail(null));
    } else {
      setProjectDetail(null);
    }
  }, [scope, projectId, type]);

  const distributionPreview = useMemo(() => {
    if (type !== "income" || !distribute || !projectDetail || isEdit) return [];
    const withShare = projectDetail.members.filter(m => m.percent !== null);
    if (!withShare.length) return [];
    const totalPercent = withShare.reduce(
      (acc, m) => acc + Number(m.percent),
      0
    );
    if (totalPercent <= 0) return [];
    const total = Number(amount);
    if (!isFinite(total) || total <= 0) return [];
    let distributed = 0;
    return withShare.map((m, i) => {
      const raw = (total * Number(m.percent)) / totalPercent;
      const rounded =
        i === withShare.length - 1
          ? Math.round((total - distributed) * 100) / 100
          : Math.round(raw * 100) / 100;
      distributed += rounded;
      return {
        memberId: m.memberId,
        name: m.name,
        percent: Number(m.percent),
        amount: rounded,
      };
    });
  }, [type, distribute, projectDetail, amount, isEdit]);

  const addTag = (raw: string) => {
    const v = raw.trim();
    if (!v || tags.includes(v)) return;
    setTags(prev => [...prev, v]);
  };

  const handleTagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
      setTagInput("");
    }
  };

  const canSubmit =
    title.trim() &&
    Number(amount) > 0 &&
    (type !== "payout" || memberId) &&
    (scope !== "PROJECT" || projectId) &&
    (scope !== "MEMBER" || memberId);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      if (isEdit && row) {
        if (isExpense(row)) {
          await apiJson(`/api/finance/expenses/${row.id}`, "PATCH", {
            title: title.trim(),
            amount: Number(amount),
            currency,
            kind: type === "payout" ? "PAYOUT" : "EXPENSE",
            scope: type === "payout" ? "MEMBER" : scope,
            projectId: scope === "PROJECT" ? projectId : null,
            memberId: type === "payout" || scope === "MEMBER" ? memberId : null,
            date,
            description: description.trim(),
            tags,
          });
        } else {
          await apiJson(`/api/finance/incomes/${row.id}`, "PATCH", {
            title: title.trim(),
            amount: Number(amount),
            currency,
            date,
            description: description.trim(),
          });
        }
        toast.success(t("common.saved"));
      } else if (type === "income") {
        await apiJson("/api/finance/incomes", "POST", {
          title: title.trim(),
          amount: Number(amount),
          currency,
          projectId: scope === "PROJECT" ? projectId : null,
          date,
          description: description.trim(),
          distribute,
        });
        toast.success(t("finance.operation.savedIncome"));
      } else {
        await apiJson("/api/finance/expenses", "POST", {
          title: title.trim(),
          amount: Number(amount),
          currency,
          kind: type === "payout" ? "PAYOUT" : "EXPENSE",
          scope: type === "payout" ? "MEMBER" : scope,
          projectId: scope === "PROJECT" ? projectId : null,
          memberId: type === "payout" || scope === "MEMBER" ? memberId : null,
          date,
          description: description.trim(),
          tags,
        });
        toast.success(t("finance.operation.savedExpense"));
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const typeButton = (k: OpType, label: string) => (
    <button
      key={k}
      type="button"
      disabled={isEdit}
      onClick={() => {
        setType(k);
        if (k === "payout") setScope("MEMBER");
        if (k === "income" && scope === "MEMBER") setScope("PROJECT");
      }}
      className={cn(
        "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        type === k
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        isEdit && "cursor-not-allowed opacity-60"
      )}
    >
      {label}
    </button>
  );

  const scopeOptions = (
    type === "income"
      ? [
          { value: "TEAM" as Scope, label: t("finance.operation.scope.team") },
          {
            value: "PROJECT" as Scope,
            label: t("finance.operation.scope.project"),
          },
        ]
      : type === "payout"
        ? [
            {
              value: "MEMBER" as Scope,
              label: t("finance.operation.scope.member"),
            },
          ]
        : [
            {
              value: "TEAM" as Scope,
              label: t("finance.operation.scope.team"),
            },
            {
              value: "PROJECT" as Scope,
              label: t("finance.operation.scope.project"),
            },
            {
              value: "MEMBER" as Scope,
              label: t("finance.operation.scope.member"),
            },
          ]
  ).map(o => ({ value: o.value, label: o.label }));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? t("common.edit") : t("finance.operation.title")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex rounded-lg border bg-muted p-1">
            {typeButton("expense", t("finance.operation.type.expense"))}
            {typeButton("payout", t("finance.operation.type.payout"))}
            {typeButton("income", t("finance.operation.type.income"))}
          </div>

          <div>
            <Label htmlFor="op-title">{t("finance.operation.name")}</Label>
            <Input
              id="op-title"
              className="mt-1.5"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="op-amount">{t("finance.operation.amount")}</Label>
              <Input
                id="op-amount"
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
                  onChange={v => setScope(v as Scope)}
                  options={scopeOptions}
                  disabled={isEdit && type === "income"}
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
                    disabled={isEdit && type === "income"}
                    searchPlaceholder={t("common.search")}
                    emptyText={t("common.nothingFound")}
                    ariaLabel={t("finance.operation.project")}
                  />
                </div>
              </div>
            )}
            {(type === "payout" || scope === "MEMBER") && (
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

          <div>
            <Label htmlFor="op-date">{t("finance.operation.date")}</Label>
            <Input
              id="op-date"
              className="mt-1.5"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="op-desc">
              {t("finance.operation.description")}
            </Label>
            <Textarea
              id="op-desc"
              className="mt-1.5"
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {type !== "income" && (isEdit ? isExpense(row!) : true) && (
            <div>
              <Label>{t("finance.operation.tags")}</Label>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter(x => x !== tag))}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <Input
                  className="h-6 min-w-24 flex-1 border-0 px-1 py-0 text-sm focus-visible:ring-0"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagKey}
                  onBlur={() => {
                    addTag(tagInput);
                    setTagInput("");
                  }}
                  placeholder={t("finance.operation.tagsHint")}
                />
              </div>
            </div>
          )}

          {type === "income" && scope === "PROJECT" && !isEdit && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="op-distribute" className="cursor-pointer">
                  {t("finance.operation.distribute")}
                </Label>
                <Switch
                  id="op-distribute"
                  checked={distribute}
                  onCheckedChange={setDistribute}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("finance.operation.distributeHint")}
              </p>

              {distribute && distributionPreview.length > 0 && (
                <div className="mt-3 space-y-2">
                  {distributionPreview.map(m => (
                    <div key={m.memberId} className="flex items-center gap-3">
                      <span className="w-28 truncate text-sm">{m.name}</span>
                      <span className="w-12 text-right text-sm">
                        {m.percent}%
                      </span>
                      <div className="flex-1">
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${Math.min(m.percent, 100)}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-20 text-right text-sm font-medium">
                        {m.amount.toFixed(2)} {currency}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !canSubmit}>
              {busy
                ? t("common.saving")
                : isEdit
                  ? t("common.save")
                  : t("finance.operation.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
