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
import { Badge } from "@/components/ui/badge";
import { apiFetch, apiJson } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import { usePermissions } from "@/lib/use-permissions";
import { useConfirm } from "@/components/confirm-dialog";
import { formatMoney } from "../helpers";
import MemberForm from "./MemberForm";
import LinkUserDialog from "./LinkUserDialog";
import type { MemberRow, ExpenseRow, DistributionRow } from "../types";

const fetcher =
  () =>
  async (q: DataTableQuery): Promise<DataTableResult<MemberRow>> => {
    const params = new URLSearchParams({
      page: String(q.page),
      pageSize: String(q.pageSize),
    });
    if (q.sort && q.order) {
      params.set("sort", q.sort);
      params.set("order", q.order);
    }
    if (q.search) params.set("search", q.search);
    if (q.filters.active) params.set("active", q.filters.active);

    const data = await apiFetch(`/api/finance/members?${params}`);
    return { rows: data.rows, total: data.total };
  };

export default function TeamPage({
  displayCurrency,
}: {
  displayCurrency: string;
}) {
  const { t, fmtNum } = useI18n();
  const { can } = usePermissions();
  const { confirm } = useConfirm();
  const [reloadKey, setReloadKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editMember, setEditMember] = useState<MemberRow | null>(null);
  const [linkMember, setLinkMember] = useState<MemberRow | null>(null);
  const [earnedMap, setEarnedMap] = useState<Map<string, number>>(new Map());
  const [paidMap, setPaidMap] = useState<Map<string, number>>(new Map());

  const loadBalances = useCallback(async () => {
    try {
      const [dists, payouts] = await Promise.all([
        apiFetch("/api/finance/distributions?page=1&pageSize=1000") as Promise<{
          rows: DistributionRow[];
        }>,
        apiFetch(
          "/api/finance/expenses?kind=PAYOUT&status=APPROVED&pageSize=1000"
        ) as Promise<{ rows: ExpenseRow[] }>,
      ]);
      const earned = new Map<string, number>();
      for (const d of dists.rows) {
        earned.set(
          d.memberId,
          (earned.get(d.memberId) ?? 0) + Number(d.amountBase)
        );
      }
      setEarnedMap(earned);

      const paid = new Map<string, number>();
      for (const e of payouts.rows) {
        if (e.memberId) {
          paid.set(
            e.memberId,
            (paid.get(e.memberId) ?? 0) + Number(e.amountBase)
          );
        }
      }
      setPaidMap(paid);
    } catch {
      setEarnedMap(new Map());
      setPaidMap(new Map());
    }
  }, []);

  useEffect(() => {
    loadBalances();
  }, [loadBalances, reloadKey]);

  const deactivate = async (m: MemberRow) => {
    const ok = await confirm({
      title: t("finance.team.action.deactivate"),
      description: t("finance.team.confirm.deactivate", { name: m.name }),
      confirmText: t("finance.team.action.deactivate"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiJson(`/api/finance/members/${m.id}`, "PATCH", { active: false });
      toast.success(t("common.saved"));
      setReloadKey(k => k + 1);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const columns: Array<DataTableColumn<MemberRow>> = [
    {
      id: "name",
      header: t("finance.team.col.member"),
      sortable: true,
      cell: r => (
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {r.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="font-medium">{r.name}</span>
        </div>
      ),
    },
    {
      id: "position",
      header: t("finance.team.col.role"),
      cell: r => (
        <span className="text-muted-foreground">
          {r.position || t("finance.none")}
        </span>
      ),
    },
    {
      id: "account",
      header: t("finance.team.col.account"),
      cell: r =>
        r.user ? (
          <Badge variant="secondary">
            {t("finance.team.account.linked", { email: r.user.email })}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t("finance.team.account.none")}
          </span>
        ),
    },
    {
      id: "earned",
      header: t("finance.team.col.earned"),
      className: "tabular",
      cell: r => (
        <span>
          {formatMoney(earnedMap.get(r.id) ?? 0, displayCurrency, fmtNum)}
        </span>
      ),
    },
    {
      id: "paid",
      header: t("finance.team.col.paid"),
      className: "tabular",
      cell: r => (
        <span>
          {formatMoney(paidMap.get(r.id) ?? 0, displayCurrency, fmtNum)}
        </span>
      ),
    },
    {
      id: "balance",
      header: t("finance.team.col.balance"),
      className: "tabular",
      cell: r => {
        const b = (earnedMap.get(r.id) ?? 0) - (paidMap.get(r.id) ?? 0);
        return (
          <span className={`font-semibold ${b < 0 ? "text-destructive" : ""}`}>
            {formatMoney(b, displayCurrency, fmtNum)}
          </span>
        );
      },
    },
    {
      id: "active",
      header: t("finance.team.col.active"),
      cell: r => (
        <Badge variant={r.active ? "success" : "muted"}>
          {r.active
            ? t("finance.team.status.active")
            : t("finance.team.status.inactive")}
        </Badge>
      ),
    },
  ];

  const filters: DataTableFilter[] = [
    {
      id: "active",
      label: t("finance.team.col.active"),
      options: [
        { value: "true", label: t("finance.active") },
        { value: "false", label: t("finance.inactive") },
      ],
    },
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t("finance.team.title")}
          </h1>
        </div>
        {can("finance.admin") && (
          <Button onClick={() => setFormOpen(true)}>
            <Plus />
            {t("finance.team.add")}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-5">
          <DataTable<MemberRow>
            columns={columns}
            fetcher={fetcher()}
            rowKey={r => r.id}
            defaultSort={{ sort: "createdAt", order: "desc" }}
            searchPlaceholder={t("finance.team.searchPlaceholder")}
            reloadKey={reloadKey}
            emptyText={t("finance.team.empty")}
            filters={filters}
            actions={[
              {
                label: t("common.edit"),
                permission: "finance.admin",
                onClick: r => setEditMember(r),
              },
              {
                label: t("finance.team.action.linkUser"),
                permission: "finance.admin",
                hidden: r => !!r.user,
                onClick: r => setLinkMember(r),
              },
              {
                label: t("finance.team.action.unlink"),
                permission: "finance.admin",
                hidden: r => !r.user,
                onClick: async (r, rl) => {
                  try {
                    await apiJson(
                      `/api/finance/members/${r.id}/link-user`,
                      "POST",
                      {
                        userId: null,
                      }
                    );
                    toast.success(t("common.saved"));
                    rl();
                  } catch (e: any) {
                    toast.error(e.message);
                  }
                },
              },
              {
                label: t("finance.team.action.deactivate"),
                permission: "finance.manage",
                hidden: r => !r.active,
                variant: "destructive",
                onClick: r => deactivate(r),
              },
            ]}
          />
        </CardContent>
      </Card>

      <MemberForm
        open={formOpen || !!editMember}
        row={editMember ?? undefined}
        onClose={() => {
          setFormOpen(false);
          setEditMember(null);
        }}
        onSaved={() => setReloadKey(k => k + 1)}
      />

      {linkMember && (
        <LinkUserDialog
          open
          member={linkMember}
          onClose={() => setLinkMember(null)}
          onSaved={() => setReloadKey(k => k + 1)}
        />
      )}
    </div>
  );
}
