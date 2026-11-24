"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import { usePermissions } from "@/lib/use-permissions";
import { formatMoney, kindBadge, scopeBadge } from "./helpers";
import OperationDialog from "./OperationDialog";
import type { Summary, ExpenseRow, IncomeRow, ProjectRow } from "./types";

export default function FinanceDashboard({
  displayCurrency,
}: {
  displayCurrency: string;
}) {
  const { t, fmtNum, fmtDate } = useI18n();
  const { can } = usePermissions();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [recent, setRecent] = useState<Array<ExpenseRow | IncomeRow>>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, projData] = await Promise.all([
        apiFetch("/api/finance/summary") as Promise<Summary>,
        apiFetch(
          "/api/finance/projects?archived=false&pageSize=1000"
        ) as Promise<{
          rows: ProjectRow[];
        }>,
      ]);
      setSummary(s);
      setProjects(projData.rows);
      const [exp, inc] = await Promise.all([
        apiFetch(
          "/api/finance/expenses?page=1&pageSize=10&sort=date&order=desc"
        ) as Promise<{ rows: ExpenseRow[] }>,
        apiFetch(
          "/api/finance/incomes?page=1&pageSize=10&sort=date&order=desc"
        ) as Promise<{ rows: IncomeRow[] }>,
      ]);
      const all = [
        ...exp.rows.map(r => ({ ...r, _op: "expense" as const })),
        ...inc.rows.map(r => ({ ...r, _op: "income" as const })),
      ];
      all.sort((a, b) => +new Date(b.date) - +new Date(a.date));
      setRecent(all.slice(0, 10));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const balanceColor = (v: number) =>
    v < 0 ? "text-destructive" : "text-foreground";

  const opTarget = (r: ExpenseRow | IncomeRow) => {
    if ("scope" in r) {
      if (r.scope === "PROJECT") return r.project?.name || t("finance.none");
      if (r.scope === "MEMBER") return r.member?.name || t("finance.none");
      return t("finance.scope.TEAM");
    }
    return r.project?.name || t("finance.scope.TEAM");
  };

  const opBadge = (r: ExpenseRow | IncomeRow) => {
    if ("scope" in r) {
      return (
        <div className="flex items-center gap-1">
          {kindBadge(r.kind, t)}
          {scopeBadge(r.scope, t)}
        </div>
      );
    }
    return (
      <Badge variant="default">{t("finance.operation.type.income")}</Badge>
    );
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t("finance.board.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("finance.board.subtitle")}
          </p>
        </div>
        {can("finance.submit") && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus />
            {t("finance.board.add")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("finance.board.teamBalance")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-semibold ${balanceColor(summary?.teamBalance ?? 0)}`}
            >
              {formatMoney(summary?.teamBalance ?? 0, displayCurrency, fmtNum)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("finance.board.payable")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {formatMoney(summary?.payable ?? 0, displayCurrency, fmtNum)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("finance.board.monthExpense")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-destructive">
              {formatMoney(summary?.monthExpense ?? 0, displayCurrency, fmtNum)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("finance.board.monthIncome")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-success">
              {formatMoney(summary?.monthIncome ?? 0, displayCurrency, fmtNum)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">
              {t("finance.board.memberBalances")}
            </CardTitle>
            <Link
              href="/finance/team"
              className="text-sm font-medium text-primary hover:underline"
            >
              {t("finance.board.allTeam")}
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("finance.team.col.member")}</TableHead>
                  <TableHead className="text-right">
                    {t("finance.team.col.balance")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("finance.board.payable")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !summary ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground"
                    >
                      …
                    </TableCell>
                  </TableRow>
                ) : (
                  summary?.members.map(m => (
                    <TableRow key={m.memberId}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell
                        className={`text-right font-semibold ${balanceColor(m.balance)}`}
                      >
                        {formatMoney(m.balance, displayCurrency, fmtNum)}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.balance > 0
                          ? formatMoney(m.balance, displayCurrency, fmtNum)
                          : t("finance.none")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">
              {t("finance.board.projectBalances")}
            </CardTitle>
            <Link
              href="/finance/projects"
              className="text-sm font-medium text-primary hover:underline"
            >
              {t("finance.board.allProjects")}
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("finance.projects.title")}</TableHead>
                  <TableHead className="text-right">
                    {t("finance.team.col.balance")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("finance.projects.col.members")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !summary ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground"
                    >
                      …
                    </TableCell>
                  </TableRow>
                ) : (
                  summary?.projects.map(p => (
                    <TableRow key={p.projectId}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell
                        className={`text-right font-semibold ${balanceColor(p.balance)}`}
                      >
                        {formatMoney(p.balance, displayCurrency, fmtNum)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {projects.find(x => x.id === p.projectId)?._count
                          .members ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t("finance.board.recentOperations")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("finance.expenses.col.date")}</TableHead>
                  <TableHead>{t("finance.expenses.col.title")}</TableHead>
                  <TableHead>{t("finance.expenses.col.kind")}</TableHead>
                  <TableHead>{t("finance.expenses.col.scope")}</TableHead>
                  <TableHead className="text-right">
                    {t("finance.expenses.col.amount")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map(r => (
                  <TableRow key={("scope" in r ? "e:" : "i:") + r.id}>
                    <TableCell className="text-muted-foreground">
                      {fmtDate(r.date)}
                    </TableCell>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell>{opBadge(r)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {opTarget(r)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(
                        "scope" in r ? r.amount : r.amount,
                        r.currency,
                        fmtNum
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && recent.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      {t("finance.income.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {summary && summary.upcomingRecurring.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t("finance.board.upcomingRecurring")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="divide-y">
                {summary.upcomingRecurring.map(r => (
                  <div key={r.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{r.title}</span>
                      <span className="text-sm font-semibold">
                        {formatMoney(r.amount, r.currency, fmtNum)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.scope === "PROJECT"
                        ? t("finance.scope.PROJECT")
                        : r.scope === "MEMBER"
                          ? t("finance.scope.MEMBER")
                          : t("finance.scope.TEAM")}{" "}
                      · {fmtDate(r.nextRunAt)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <OperationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={load}
        displayCurrency={displayCurrency}
      />
    </div>
  );
}
