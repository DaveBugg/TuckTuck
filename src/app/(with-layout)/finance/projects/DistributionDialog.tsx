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
import { SearchSelect } from "@/components/ui/search-select";
import { apiFetch, apiJson } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import { formatMoney } from "../helpers";
import type { ProjectRow, ProjectDetail } from "../types";

const NONE = "__none__";

type Tab = "percent" | "amount";

export default function DistributionDialog({
  open,
  project,
  balance,
  displayCurrency,
  onClose,
  onSaved,
}: {
  open: boolean;
  project: ProjectRow;
  balance: number;
  displayCurrency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, fmtNum } = useI18n();
  const [tab, setTab] = useState<Tab>("percent");
  const [memberId, setMemberId] = useState("");
  const [percent, setPercent] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<
    Array<{ id: string; name: string; percent: string | null }>
  >([]);

  useEffect(() => {
    if (!open) return;
    apiFetch(`/api/finance/projects/${project.id}`)
      .then((d: { row: ProjectDetail }) =>
        setMembers(
          d.row.members.map(m => ({
            id: m.memberId,
            name: m.name,
            percent: m.percent,
          }))
        )
      )
      .catch(() => setMembers([]));
  }, [open, project.id]);

  const previewAmount = useMemo(() => {
    if (tab === "amount") return Number(amount) || 0;
    const p = Number(percent);
    if (!isFinite(p) || p <= 0) return 0;
    return Math.round(((balance * p) / 100) * 100) / 100;
  }, [tab, amount, percent, balance]);

  const canSubmit =
    memberId && previewAmount > 0 && previewAmount <= balance + 1e-8;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        memberId,
        projectId: project.id,
        note: note.trim(),
      };
      if (tab === "percent") body.percent = Number(percent);
      else body.amountBase = previewAmount;
      await apiJson("/api/finance/distributions", "POST", body);
      toast.success(t("common.saved"));
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("finance.projects.distribute.title")}</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            {t("finance.projects.distribute.available", {
              amount: formatMoney(balance, displayCurrency, fmtNum),
            })}
          </p>

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

          <div className="flex rounded-lg border bg-muted p-1">
            <button
              type="button"
              onClick={() => setTab("percent")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "percent"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("finance.projects.distribute.tabPercent")}
            </button>
            <button
              type="button"
              onClick={() => setTab("amount")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "amount"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("finance.projects.distribute.tabAmount")}
            </button>
          </div>

          {tab === "percent" ? (
            <div>
              <Label htmlFor="dist-percent">%</Label>
              <Input
                id="dist-percent"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={percent}
                onChange={e => setPercent(e.target.value)}
                className="mt-1.5"
              />
            </div>
          ) : (
            <div>
              <Label htmlFor="dist-amount">
                {t("finance.operation.amount")}
              </Label>
              <Input
                id="dist-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="mt-1.5"
              />
            </div>
          )}

          <div className="rounded-lg border bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              {t("finance.projects.distribute.preview")}
            </p>
            <p className="text-lg font-semibold">
              {formatMoney(previewAmount, displayCurrency, fmtNum)}
            </p>
          </div>

          <div>
            <Label htmlFor="dist-note">
              {t("finance.projects.distribute.note")}
            </Label>
            <Textarea
              id="dist-note"
              className="mt-1.5"
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !canSubmit}>
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
