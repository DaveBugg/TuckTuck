"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { toast } from "sonner";
import DataTable, {
  apiFetcher,
  type DataTableColumn,
  type DataTableFilter,
  type DataTableQuery,
  type DataTableResult,
} from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch, apiJson } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import { usePermissions } from "@/lib/use-permissions";
import { useConfirm } from "@/components/confirm-dialog";
import { moneyCell, statusBadge, kindBadge, scopeBadge } from "../helpers";
import OperationDialog from "../OperationDialog";
import type { ExpenseRow } from "../types";

const fetcher =
  (displayCurrency: string) =>
  async (q: DataTableQuery): Promise<DataTableResult<ExpenseRow>> => {
    const params = new URLSearchParams({
      page: String(q.page),
      pageSize: String(q.pageSize),
    });
    if (q.sort && q.order) {
      params.set("sort", q.sort);
      params.set("order", q.order);
    }
    if (q.search) params.set("search", q.search);
    if (q.filters.kind) params.set("kind", q.filters.kind);
    if (q.filters.status) params.set("status", q.filters.status);
    if (q.filters.scope) params.set("scope", q.filters.scope);
    if (q.filters.projectId) params.set("projectId", q.filters.projectId);
    if (q.filters.memberId) params.set("memberId", q.filters.memberId);

    const period = q.filters.period;
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    if (period === "thisMonth") {
      const from = new Date(Date.UTC(year, month, 1));
      const to = new Date(Date.UTC(year, month + 1, 0));
      params.set("dateFrom", from.toISOString().slice(0, 10));
      params.set("dateTo", to.toISOString().slice(0, 10));
    } else if (period === "lastMonth") {
      const from = new Date(Date.UTC(year, month - 1, 1));
      const to = new Date(Date.UTC(year, month, 0));
      params.set("dateFrom", from.toISOString().slice(0, 10));
      params.set("dateTo", to.toISOString().slice(0, 10));
    }

    const data = await apiFetch(`/api/finance/expenses?${params}`);
    return { rows: data.rows, total: data.total };
  };

export default function ExpensesPage({
  displayCurrency,
}: {
  displayCurrency: string;
}) {
  const { t, fmtDate, fmtNum } = useI18n();
  const { can } = usePermissions();
  const { confirm } = useConfirm();
  const [reloadKey, setReloadKey] = useState(0);
  const [modal, setModal] = useState<{ open: boolean; row?: ExpenseRow }>({
    open: false,
  });
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>(
    []
  );

  useEffect(() => {
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
  }, []);

  const handleApprove = async (row: ExpenseRow) => {
    const ok = await confirm({
      title: t("finance.expenses.action.approve"),
      description: t("finance.expenses.confirm.approve", { title: row.title }),
      confirmText: t("finance.expenses.action.approve"),
    });
    if (!ok) return;
    try {
      await apiJson(`/api/finance/expenses/${row.id}/approve`, "POST", {});
      toast.success(t("finance.expenses.toast.approved"));
      setReloadKey(k => k + 1);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleReject = async (row: ExpenseRow) => {
    const ok = await confirm({
      title: t("finance.expenses.action.reject"),
      description: t("finance.expenses.confirm.reject", { title: row.title }),
      confirmText: t("finance.expenses.action.reject"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiJson(`/api/finance/expenses/${row.id}/reject`, "POST", {});
      toast.success(t("finance.expenses.toast.rejected"));
      setReloadKey(k => k + 1);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const canEdit = (row: ExpenseRow) =>
    row.status === "PENDING" ? can("finance.submit") : can("finance.manage");

  const columns: Array<DataTableColumn<ExpenseRow>> = [
    {
      id: "date",
      header: t("finance.expenses.col.date"),
      sortable: true,
      className: "tabular",
      cell: r => (
        <span className="text-muted-foreground">{fmtDate(r.date)}</span>
      ),
    },
    {
      id: "title",
      header: t("finance.expenses.col.title"),
      sortable: true,
      cell: r => (
        <div>
          <div className="font-medium">{r.title}</div>
          {r.description && (
            <div className="truncate text-xs text-muted-foreground">
              {r.description}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "kind",
      header: t("finance.expenses.col.kind"),
      sortable: true,
      cell: r => kindBadge(r.kind, t),
    },
    {
      id: "scope",
      header: t("finance.expenses.col.scope"),
      sortable: true,
      cell: r => scopeBadge(r.scope, t),
    },
    {
      id: "target",
      header: t("finance.expenses.col.target"),
      cell: r => (
        <span className="text-muted-foreground">
          {r.scope === "PROJECT"
            ? (r.project?.name ?? t("finance.none"))
            : r.scope === "MEMBER"
              ? (r.member?.name ?? t("finance.none"))
              : t("finance.scope.TEAM")}
        </span>
      ),
    },
    {
      id: "amount",
      header: t("finance.expenses.col.amount"),
      sortable: true,
      className: "tabular",
      cell: r => moneyCell(r, displayCurrency, fmtNum),
    },
    {
      id: "status",
      header: t("finance.expenses.col.status"),
      sortable: true,
      cell: r => (
        <div className="flex items-center gap-2">
          {statusBadge(r.status, t)}
          {r.status === "PENDING" && can("finance.approve") && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleApprove(r)}
                title={t("finance.expenses.action.approve")}
              >
                <Check className="text-success" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleReject(r)}
                title={t("finance.expenses.action.reject")}
              >
                <X className="text-destructive" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const filters: DataTableFilter[] = [
    {
      id: "period",
      label: t("finance.expenses.filter.period"),
      options: [
        { value: "thisMonth", label: t("finance.expenses.period.thisMonth") },
        { value: "lastMonth", label: t("finance.expenses.period.lastMonth") },
        { value: "allTime", label: t("finance.expenses.period.allTime") },
      ],
    },
    {
      id: "kind",
      label: t("finance.expenses.filter.kind"),
      options: [
        { value: "EXPENSE", label: t("finance.kind.EXPENSE") },
        { value: "PAYOUT", label: t("finance.kind.PAYOUT") },
      ],
    },
    {
      id: "status",
      label: t("finance.expenses.filter.status"),
      options: [
        { value: "PENDING", label: t("finance.status.PENDING") },
        { value: "APPROVED", label: t("finance.status.APPROVED") },
        { value: "REJECTED", label: t("finance.status.REJECTED") },
      ],
    },
    {
      id: "scope",
      label: t("finance.expenses.filter.scope"),
      options: [
        { value: "TEAM", label: t("finance.scope.TEAM") },
        { value: "PROJECT", label: t("finance.scope.PROJECT") },
        { value: "MEMBER", label: t("finance.scope.MEMBER") },
      ],
    },
    {
      id: "projectId",
      label: t("finance.expenses.filter.project"),
      options: projects.map(p => ({ value: p.id, label: p.name })),
    },
    {
      id: "memberId",
      label: t("finance.expenses.filter.member"),
      options: members.map(m => ({ value: m.id, label: m.name })),
    },
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t("finance.expenses.title")}
          </h1>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <DataTable<ExpenseRow>
            columns={columns}
            fetcher={fetcher(displayCurrency)}
            rowKey={r => r.id}
            defaultSort={{ sort: "date", order: "desc" }}
            searchPlaceholder={t("finance.expenses.searchPlaceholder")}
            reloadKey={reloadKey}
            emptyText={t("finance.expenses.empty")}
            filters={filters}
            toolbar={
              can("finance.submit") ? (
                <Button onClick={() => setModal({ open: true })}>
                  <Plus />
                  {t("finance.expenses.add")}
                </Button>
              ) : undefined
            }
            actions={[
              {
                label: t("common.edit"),
                hidden: r => !canEdit(r),
                onClick: (r, rl) => {
                  setModal({ open: true, row: r });
                },
              },
              {
                label: t("common.delete"),
                variant: "destructive",
                hidden: r => !canEdit(r),
                onClick: async (r, rl) => {
                  const ok = await confirm({
                    title: t("common.delete"),
                    description: t("finance.expenses.confirm.delete", {
                      title: r.title,
                    }),
                    confirmText: t("common.yesDelete"),
                    destructive: true,
                  });
                  if (!ok) return;
                  try {
                    await apiJson(`/api/finance/expenses/${r.id}`, "DELETE");
                    toast.success(t("common.deleted"));
                    rl();
                  } catch (e: any) {
                    toast.error(e.message);
                  }
                },
              },
            ]}
          />
        </CardContent>
      </Card>

      <OperationDialog
        open={modal.open}
        row={modal.row}
        onClose={() => setModal({ open: false })}
        onSaved={() => setReloadKey(k => k + 1)}
        displayCurrency={displayCurrency}
        initialType="expense"
      />
    </div>
  );
}
