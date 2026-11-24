"use client";

import React, { useState } from "react";
import { Eye } from "lucide-react";
import DataTable, {
  type DataTableColumn,
  type DataTableFilter,
  type DataTableQuery,
  type DataTableResult,
} from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import type { AuditRow } from "../types";

const fetcher =
  () =>
  async (q: DataTableQuery): Promise<DataTableResult<AuditRow>> => {
    const params = new URLSearchParams({
      page: String(q.page),
      pageSize: String(q.pageSize),
    });
    if (q.sort && q.order) {
      params.set("sort", q.sort);
      params.set("order", q.order);
    }
    if (q.search) params.set("search", q.search);
    if (q.filters.entity) params.set("entity", q.filters.entity);
    if (q.filters.action) params.set("action", q.filters.action);

    const data = await apiFetch(`/api/finance/audit?${params}`);
    return { rows: data.rows, total: data.total };
  };

const ENTITIES = ["expense", "income", "distribution", "project", "member"];
const ACTIONS = ["CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT"];

export default function AuditPage() {
  const { t, fmtDateTime } = useI18n();
  const [detail, setDetail] = useState<AuditRow | null>(null);

  const columns: Array<DataTableColumn<AuditRow>> = [
    {
      id: "createdAt",
      header: t("finance.audit.col.date"),
      sortable: true,
      className: "tabular",
      cell: r => (
        <span className="text-muted-foreground">
          {fmtDateTime(r.createdAt)}
        </span>
      ),
    },
    {
      id: "actor",
      header: t("finance.audit.col.actor"),
      cell: r => <span>{r.actor ? r.actor.name || r.actor.email : "—"}</span>,
    },
    {
      id: "action",
      header: t("finance.audit.col.action"),
      cell: r => <span className="font-medium">{r.action}</span>,
    },
    {
      id: "entity",
      header: t("finance.audit.col.entity"),
      cell: r => <span className="text-muted-foreground">{r.entity}</span>,
    },
    {
      id: "entityId",
      header: t("finance.audit.col.entityId"),
      className: "tabular",
      cell: r => (
        <span className="truncate font-mono text-xs">{r.entityId}</span>
      ),
    },
  ];

  const filters: DataTableFilter[] = [
    {
      id: "entity",
      label: t("finance.audit.filter.entity"),
      options: ENTITIES.map(e => ({ value: e, label: e })),
    },
    {
      id: "action",
      label: t("finance.audit.filter.action"),
      options: ACTIONS.map(a => ({ value: a, label: a })),
    },
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {t("finance.audit.title")}
        </h1>
      </div>

      <Card>
        <CardContent className="pt-5">
          <DataTable<AuditRow>
            columns={columns}
            fetcher={fetcher()}
            rowKey={r => r.id}
            defaultSort={{ sort: "createdAt", order: "desc" }}
            searchPlaceholder={t("finance.audit.searchPlaceholder")}
            emptyText={t("finance.audit.empty")}
            filters={filters}
            actions={[
              {
                label: t("finance.audit.action.view"),
                onClick: r => setDetail(r),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={v => !v && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detail?.entity} · {detail?.action}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                {t("finance.audit.diff.before")}
              </p>
              <pre className="max-h-96 overflow-auto rounded-md border bg-muted p-3 text-xs">
                {JSON.stringify(detail?.before ?? null, null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                {t("finance.audit.diff.after")}
              </p>
              <pre className="max-h-96 overflow-auto rounded-md border bg-muted p-3 text-xs">
                {JSON.stringify(detail?.after ?? null, null, 2)}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
