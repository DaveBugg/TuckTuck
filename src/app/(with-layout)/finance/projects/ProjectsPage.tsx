"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiFetch, apiJson } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import { usePermissions } from "@/lib/use-permissions";
import { useConfirm } from "@/components/confirm-dialog";
import { formatMoney } from "../helpers";
import ProjectForm from "./ProjectForm";
import MembersEditDialog from "./MembersEditDialog";
import DistributionDialog from "./DistributionDialog";
import type { Summary, ProjectRow, ExpenseRow, IncomeRow } from "../types";

export default function ProjectsPage({
  displayCurrency,
}: {
  displayCurrency: string;
}) {
  const { t, fmtNum } = useI18n();
  const { can } = usePermissions();
  const { confirm } = useConfirm();
  const [reloadKey, setReloadKey] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [monthIncomes, setMonthIncomes] = useState<Map<string, number>>(
    new Map()
  );
  const [monthExpenses, setMonthExpenses] = useState<Map<string, number>>(
    new Map()
  );
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectRow | null>(null);
  const [membersEdit, setMembersEdit] = useState<ProjectRow | null>(null);
  const [distributeProject, setDistributeProject] = useState<ProjectRow | null>(
    null
  );

  const load = useCallback(async () => {
    try {
      const s: Summary = await apiFetch("/api/finance/summary");
      setSummary(s);
      const data = await apiFetch(
        "/api/finance/projects?archived=false&pageSize=1000"
      );
      setProjects(data.rows);

      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      const from = new Date(Date.UTC(year, month, 1))
        .toISOString()
        .slice(0, 10);
      const to = new Date(Date.UTC(year, month + 1, 0))
        .toISOString()
        .slice(0, 10);

      const [inc, exp] = await Promise.all([
        apiFetch(
          `/api/finance/incomes?dateFrom=${from}&dateTo=${to}&pageSize=1000`
        ) as Promise<{ rows: IncomeRow[] }>,
        apiFetch(
          `/api/finance/expenses?dateFrom=${from}&dateTo=${to}&kind=EXPENSE&status=APPROVED&pageSize=1000`
        ) as Promise<{ rows: ExpenseRow[] }>,
      ]);

      const incMap = new Map<string, number>();
      for (const r of inc.rows) {
        if (r.projectId) {
          incMap.set(
            r.projectId,
            (incMap.get(r.projectId) ?? 0) + Number(r.amountBase)
          );
        }
      }
      setMonthIncomes(incMap);

      const expMap = new Map<string, number>();
      for (const r of exp.rows) {
        if (r.projectId) {
          expMap.set(
            r.projectId,
            (expMap.get(r.projectId) ?? 0) + Number(r.amountBase)
          );
        }
      }
      setMonthExpenses(expMap);
    } catch (e: any) {
      toast.error(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? projects.filter(
          p =>
            p.name.toLowerCase().includes(q) ||
            (p.description ?? "").toLowerCase().includes(q)
        )
      : projects;
  }, [projects, search]);

  const balanceOf = (id: string) =>
    summary?.projects.find(p => p.projectId === id)?.balance ?? 0;

  const archive = async (p: ProjectRow) => {
    const ok = await confirm({
      title: t("finance.projects.action.archive"),
      description: t("finance.projects.confirm.archive", { name: p.name }),
      confirmText: t("finance.projects.action.archive"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiJson(`/api/finance/projects/${p.id}`, "DELETE");
      toast.success(t("common.saved"));
      setReloadKey(k => k + 1);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t("finance.projects.title")}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("finance.projects.searchPlaceholder")}
            className="w-56"
          />
          {can("finance.admin") && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus />
              {t("finance.projects.add")}
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 && !search && (
        <div className="text-center text-muted-foreground">
          {t("finance.projects.empty")}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map(p => {
          const balance = balanceOf(p.id);
          const members = p._count.members;
          const inc = monthIncomes.get(p.id) ?? 0;
          const exp = monthExpenses.get(p.id) ?? 0;
          return (
            <Card key={p.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{p.name}</CardTitle>
                    {p.description && (
                      <p className="text-xs text-muted-foreground">
                        {p.description}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary">
                    {t("finance.team.status.active")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("finance.projects.balance")}
                  </p>
                  <p
                    className={`text-2xl font-semibold ${
                      balance < 0 ? "text-destructive" : "text-foreground"
                    }`}
                  >
                    {formatMoney(balance, displayCurrency, fmtNum)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">
                      {t("finance.projects.monthIncome")}
                    </p>
                    <p className="text-sm font-semibold text-success">
                      {formatMoney(inc, displayCurrency, fmtNum)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">
                      {t("finance.projects.monthExpense")}
                    </p>
                    <p className="text-sm font-semibold text-destructive">
                      {formatMoney(exp, displayCurrency, fmtNum)}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("finance.projects.membersShares")} ({members})
                  </p>
                </div>

                <div className="mt-auto flex flex-wrap gap-2">
                  {can("finance.admin") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setMembersEdit(p)}
                    >
                      {t("finance.projects.action.addMember")}
                    </Button>
                  )}
                  {can("finance.approve") && (
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => setDistributeProject(p)}
                    >
                      {t("finance.projects.action.distribute")}
                    </Button>
                  )}
                  {can("finance.manage") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditProject(p)}
                    >
                      {t("common.edit")}
                    </Button>
                  )}
                  {can("finance.manage") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => archive(p)}
                    >
                      {t("finance.projects.action.archive")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ProjectForm
        open={formOpen || !!editProject}
        row={editProject ?? undefined}
        onClose={() => {
          setFormOpen(false);
          setEditProject(null);
        }}
        onSaved={() => setReloadKey(k => k + 1)}
      />

      {membersEdit && (
        <MembersEditDialog
          open
          project={membersEdit}
          onClose={() => setMembersEdit(null)}
          onSaved={() => setReloadKey(k => k + 1)}
        />
      )}

      {distributeProject && (
        <DistributionDialog
          open
          project={distributeProject}
          balance={balanceOf(distributeProject.id)}
          displayCurrency={displayCurrency}
          onClose={() => setDistributeProject(null)}
          onSaved={() => setReloadKey(k => k + 1)}
        />
      )}
    </div>
  );
}
