"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  ChevronDown,
  ChevronUp,
  Wallet,
  Users,
  ArrowDownCircle,
  ArrowUpCircle,
  Receipt,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SearchSelect } from "@/components/ui/search-select";
import { apiFetch, apiJson } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import { usePermissions } from "@/lib/use-permissions";
import { useConfirm } from "@/components/confirm-dialog";
import { formatMoney } from "../helpers";
import ProjectForm from "./ProjectForm";
import MembersEditDialog from "./MembersEditDialog";
import DistributionDialog from "./DistributionDialog";
import OperationDialog from "../OperationDialog";
import type {
  Summary,
  ProjectRow,
  ProjectDetail,
  ExpenseRow,
  IncomeRow,
} from "../types";

const NONE = "__none__";

export default function ProjectsPage({
  displayCurrency,
}: {
  displayCurrency: string;
}) {
  const { t, fmtNum, fmtDate } = useI18n();
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
  const [details, setDetails] = useState<Record<string, ProjectDetail>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [unassigned, setUnassigned] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [linkingProjectId, setLinkingProjectId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectRow | null>(null);
  const [membersEdit, setMembersEdit] = useState<ProjectRow | null>(null);
  const [distributeProject, setDistributeProject] = useState<ProjectRow | null>(
    null
  );
  const [opDialog, setOpDialog] = useState<{
    open: boolean;
    projectId: string;
    kind: "expense" | "income";
  }>({ open: false, projectId: "", kind: "expense" });

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

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await apiFetch(`/api/finance/projects/${id}`);
      setDetails(prev => ({ ...prev, [id]: d.row }));
    } catch (e: any) {
      toast.error(e.message);
    }
  }, []);

  const loadUnassigned = useCallback(async () => {
    try {
      const d = await apiFetch("/api/resources?projectId=null&pageSize=1000");
      setUnassigned(d.rows.map((r: any) => ({ id: r.id, name: r.name })));
    } catch {
      setUnassigned([]);
    }
  }, []);

  useEffect(() => {
    if (linkingProjectId) loadUnassigned();
  }, [linkingProjectId, loadUnassigned]);

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (!details[id]) loadDetail(id);
      }
      return next;
    });
  };

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

  const linkResource = async (projectId: string, resourceId: string) => {
    if (!resourceId || resourceId === NONE) return;
    try {
      await apiJson(`/api/resources/${resourceId}`, "PATCH", { projectId });
      toast.success(t("common.saved"));
      setLinkingProjectId(null);
      setReloadKey(k => k + 1);
      if (expanded.has(projectId)) loadDetail(projectId);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const monthKeys = (
    stats: Record<string, { income: number; expense: number }>
  ) => Object.keys(stats).sort();

  const maxMonthly = (
    stats: Record<string, { income: number; expense: number }>
  ) => {
    const vals = Object.values(stats).flatMap(s => [s.income, s.expense]);
    return Math.max(1, ...vals);
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
          const inc = monthIncomes.get(p.id) ?? 0;
          const exp = monthExpenses.get(p.id) ?? 0;
          const detail = details[p.id];
          const isOpen = expanded.has(p.id);
          const members = detail?.members ?? [];
          const activeMembers = members.filter(m => m.active);
          const resources = detail?.resources ?? [];
          const stats = detail?.monthlyStats ?? {};
          const keys = monthKeys(stats);
          const maxVal = maxMonthly(stats);

          return (
            <Card key={p.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-lg truncate">{p.name}</CardTitle>
                    {p.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {p.description}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => toggleExpanded(p.id)}
                    aria-label={isOpen ? t("common.close") : t("common.open")}
                  >
                    {isOpen ? <ChevronUp /> : <ChevronDown />}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <div className="flex items-center justify-between">
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
                  {resources.length > 0 && (
                    <Badge variant="outline">
                      {t("finance.projects.resourcesCount", {
                        count: resources.length,
                      })}
                    </Badge>
                  )}
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
                    {t("finance.projects.membersShares")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {activeMembers.length === 0 && (
                      <span className="text-sm text-muted-foreground">
                        {t("finance.projects.noMembers")}
                      </span>
                    )}
                    {activeMembers.map(m => (
                      <Badge key={m.memberId} variant="secondary">
                        {m.name}
                        {m.percent !== null && (
                          <span className="ml-1 opacity-70">{m.percent}%</span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>

                {resources.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("finance.projects.resources")}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {resources.slice(0, 4).map(r => (
                        <Badge key={r.id} variant="outline">
                          {r.name}
                          <span className="ml-1 opacity-70">
                            {formatMoney(r.amount, r.currency, fmtNum)}
                          </span>
                        </Badge>
                      ))}
                      {resources.length > 4 && (
                        <Badge variant="outline">+{resources.length - 4}</Badge>
                      )}
                    </div>
                  </div>
                )}

                {isOpen && detail && (
                  <div className="space-y-4 border-t pt-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium">
                          {t("finance.projects.membersShares")}
                        </p>
                        {can("finance.admin") && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setMembersEdit(p)}
                          >
                            {t("finance.projects.action.editMembers")}
                          </Button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {members.map(m => (
                          <div
                            key={m.memberId}
                            className="flex items-center justify-between rounded-md border px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{m.name}</span>
                              {m.percent !== null && (
                                <Badge variant="secondary">{m.percent}%</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs ${
                                  m.active
                                    ? "text-success"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {m.active
                                  ? t("finance.team.status.active")
                                  : t("finance.team.status.inactive")}
                              </span>
                              <Switch checked={m.active} disabled />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {keys.length > 0 && (
                      <div>
                        <p className="mb-2 text-sm font-medium">
                          {t("finance.projects.monthlyStats")}
                        </p>
                        <div className="flex h-32 items-end gap-2">
                          {keys.map(key => {
                            const s = stats[key];
                            const incH = (s.income / maxVal) * 100;
                            const expH = (s.expense / maxVal) * 100;
                            return (
                              <div
                                key={key}
                                className="flex flex-1 flex-col items-center gap-1"
                              >
                                <div className="flex w-full items-end gap-0.5">
                                  <div
                                    className="w-1/2 rounded-sm bg-success"
                                    style={{ height: `${Math.max(incH, 2)}%` }}
                                    title={`${key}: +${s.income}`}
                                  />
                                  <div
                                    className="w-1/2 rounded-sm bg-destructive"
                                    style={{ height: `${Math.max(expH, 2)}%` }}
                                    title={`${key}: -${s.expense}`}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground">
                                  {key.slice(5)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <span className="size-2 rounded-sm bg-success" />
                            {t("finance.projects.income")}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="size-2 rounded-sm bg-destructive" />
                            {t("finance.projects.expense")}
                          </span>
                        </div>
                      </div>
                    )}

                    {detail.recentOps.length > 0 && (
                      <div>
                        <p className="mb-2 text-sm font-medium">
                          {t("finance.projects.recentOps")}
                        </p>
                        <div className="max-h-48 overflow-auto rounded-md border">
                          <table className="w-full text-sm">
                            <thead className="bg-muted text-xs uppercase text-muted-foreground">
                              <tr>
                                <th className="px-3 py-1.5 text-left">
                                  {t("finance.expenses.col.date")}
                                </th>
                                <th className="px-3 py-1.5 text-left">
                                  {t("finance.expenses.col.title")}
                                </th>
                                <th className="px-3 py-1.5 text-right">
                                  {t("finance.expenses.col.amount")}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.recentOps.map(op => (
                                <tr
                                  key={`${op.kind}-${op.id}`}
                                  className="border-t"
                                >
                                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                                    {fmtDate(op.date + "T00:00:00Z")}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <div className="flex items-center gap-1.5">
                                      {op.kind === "income" ? (
                                        <ArrowUpCircle className="size-3.5 text-success" />
                                      ) : (
                                        <ArrowDownCircle className="size-3.5 text-destructive" />
                                      )}
                                      <span className="truncate max-w-[120px]">
                                        {op.title}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">
                                    {formatMoney(
                                      op.amountBase,
                                      displayCurrency,
                                      fmtNum
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {can("resources.manage") && (
                      <div className="rounded-md border p-3">
                        <p className="mb-2 text-sm font-medium">
                          {t("finance.projects.linkResource")}
                        </p>
                        {linkingProjectId === p.id ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <SearchSelect
                                value={NONE}
                                onChange={v => linkResource(p.id, v)}
                                options={[
                                  { value: NONE, label: t("common.search") },
                                  ...unassigned.map(r => ({
                                    value: r.id,
                                    label: r.name,
                                  })),
                                ]}
                                searchPlaceholder={t("common.search")}
                                emptyText={t("finance.projects.noUnassigned")}
                                ariaLabel={t("finance.projects.linkResource")}
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setLinkingProjectId(null)}
                            >
                              ×
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLinkingProjectId(p.id)}
                          >
                            <Link2 className="mr-1 size-3.5" />
                            {t("finance.projects.action.linkResource")}
                          </Button>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {can("finance.submit") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() =>
                            setOpDialog({
                              open: true,
                              projectId: p.id,
                              kind: "expense",
                            })
                          }
                        >
                          <Receipt className="mr-1 size-3.5" />
                          {t("finance.projects.action.addExpense")}
                        </Button>
                      )}
                      {can("finance.manage") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() =>
                            setOpDialog({
                              open: true,
                              projectId: p.id,
                              kind: "income",
                            })
                          }
                        >
                          <Wallet className="mr-1 size-3.5" />
                          {t("finance.projects.action.addIncome")}
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
                  </div>
                )}
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
          onSaved={() => {
            setReloadKey(k => k + 1);
            loadDetail(membersEdit.id);
          }}
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

      <OperationDialog
        open={opDialog.open}
        onClose={() => setOpDialog(prev => ({ ...prev, open: false }))}
        onSaved={() => {
          setReloadKey(k => k + 1);
          if (expanded.has(opDialog.projectId)) {
            loadDetail(opDialog.projectId);
          }
        }}
        displayCurrency={displayCurrency}
        initialType={opDialog.kind}
        presetScope="PROJECT"
        presetProjectId={opDialog.projectId}
      />
    </div>
  );
}
