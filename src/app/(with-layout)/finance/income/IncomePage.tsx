"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import DataTable, {
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
import { moneyCell, incomeStatus, formatMoney } from "../helpers";
import OperationDialog from "../OperationDialog";
import type { IncomeRow, DistributionRow } from "../types";

const fetcher =
  (displayCurrency: string) =>
  async (q: DataTableQuery): Promise<DataTableResult<IncomeRow>> => {
    const params = new URLSearchParams({
      page: String(q.page),
      pageSize: String(q.pageSize),
    });
    if (q.sort && q.order) {
      params.set("sort", q.sort);
      params.set("order", q.order);
    }
    if (q.search) params.set("search", q.search);
    if (q.filters.projectId) params.set("projectId", q.filters.projectId);

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

    const data = await apiFetch(`/api/finance/incomes?${params}`);
    return { rows: data.rows, total: data.total };
  };

export default function IncomePage({
  displayCurrency,
}: {
  displayCurrency: string;
}) {
  const { t, fmtDate, fmtNum } = useI18n();
  const { can } = usePermissions();
  const { confirm } = useConfirm();
  const [reloadKey, setReloadKey] = useState(0);
  const [modal, setModal] = useState<{ open: boolean; row?: IncomeRow }>({
    open: false,
  });
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [distributionMap, setDistributionMap] = useState<Map<string, number>>(
    new Map()
  );

  useEffect(() => {
    apiFetch("/api/finance/projects?archived=false&pageSize=1000")
      .then((d: { rows: Array<{ id: string; name: string }> }) =>
        setProjects(d.rows)
      )
      .catch(() => setProjects([]));
  }, []);

  const loadDistributions = useCallback(async () => {
    try {
      const data = await apiFetch(
        "/api/finance/distributions?page=1&pageSize=1000"
      );
      const map = new Map<string, number>();
      for (const r of data.rows as DistributionRow[]) {
        if (r.incomeId) {
          map.set(
            r.incomeId,
            (map.get(r.incomeId) ?? 0) + Number(r.amountBase)
          );
        }
      }
      setDistributionMap(map);
    } catch {
      setDistributionMap(new Map());
    }
  }, []);

  useEffect(() => {
    loadDistributions();
  }, [loadDistributions, reloadKey]);

  const columns: Array<DataTableColumn<IncomeRow>> = [
    {
      id: "date",
      header: t("finance.income.col.date"),
      sortable: true,
      className: "tabular",
      cell: r => (
        <span className="text-muted-foreground">{fmtDate(r.date)}</span>
      ),
    },
    {
      id: "title",
      header: t("finance.income.col.title"),
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
      id: "project",
      header: t("finance.income.col.project"),
      cell: r => (
        <span className="text-muted-foreground">
          {r.project?.name ?? t("finance.scope.TEAM")}
        </span>
      ),
    },
    {
      id: "amount",
      header: t("finance.income.col.amount"),
      sortable: true,
      className: "tabular",
      cell: r => moneyCell(r, displayCurrency, fmtNum),
    },
    {
      id: "distributed",
      header: t("finance.income.col.distributed"),
      className: "tabular",
      cell: r => {
        const total = distributionMap.get(r.id) ?? 0;
        return <span>{formatMoney(total, displayCurrency, fmtNum)}</span>;
      },
    },
    {
      id: "remaining",
      header: t("finance.income.col.remaining"),
      className: "tabular",
      cell: r => {
        const total = distributionMap.get(r.id) ?? 0;
        const base = Number(r.amountBase);
        const rest = isFinite(base)
          ? Math.round((base - total) * 100) / 100
          : 0;
        return (
          <span
            className={rest > 0.001 ? "text-warning" : "text-muted-foreground"}
          >
            {formatMoney(rest, displayCurrency, fmtNum)}
          </span>
        );
      },
    },
    {
      id: "status",
      header: t("finance.income.col.status"),
      cell: r => incomeStatus(r, distributionMap.get(r.id) ?? 0, t),
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
      id: "projectId",
      label: t("finance.income.filter.project"),
      options: projects.map(p => ({ value: p.id, label: p.name })),
    },
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t("finance.income.title")}
          </h1>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <DataTable<IncomeRow>
            columns={columns}
            fetcher={fetcher(displayCurrency)}
            rowKey={r => r.id}
            defaultSort={{ sort: "date", order: "desc" }}
            searchPlaceholder={t("finance.income.searchPlaceholder")}
            reloadKey={reloadKey}
            emptyText={t("finance.income.empty")}
            filters={filters}
            toolbar={
              can("finance.manage") ? (
                <Button onClick={() => setModal({ open: true })}>
                  <Plus />
                  {t("finance.income.add")}
                </Button>
              ) : undefined
            }
            actions={[
              {
                label: t("common.edit"),
                permission: "finance.manage",
                onClick: r => setModal({ open: true, row: r }),
              },
              {
                label: t("common.delete"),
                permission: "finance.manage",
                variant: "destructive",
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
                    await apiJson(`/api/finance/incomes/${r.id}`, "DELETE");
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
        initialType="income"
      />
    </div>
  );
}
