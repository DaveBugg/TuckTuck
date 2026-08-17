"use client";

// Главный экран из ТЗ: единый список оплачиваемых ресурсов — серверы, VPN,
// прокси, домены, SaaS. Сортировка по ближайшей оплате, фильтры по сроку,
// типу, провайдеру и тегу, подсветка ближайших 14/7/3 дней и просрочки.

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Server, ShieldCheck, Repeat, Globe, AppWindow, CircleCheck } from "lucide-react";
import { toast } from "sonner";
import DataTable, { apiFetcher, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch, apiJson } from "@/lib/client-api";
import { usePermissions } from "@/lib/use-permissions";
import { useConfirm } from "@/components/confirm-dialog";
import { KINDS, kindLabel, daysUntil, dueLevel, periodText, type Kind } from "@/lib/resources";
import { MONITORABLE } from "@/lib/monitoring";
import { useI18n } from "@/components/i18n-provider";
import type { TFunc } from "@/lib/i18n/translate";
import ResourceForm from "./ResourceForm";
import AgentDialog from "./AgentDialog";
import MonitorCell from "./MonitorCell";
import type { SystemView } from "@/components/monitoring/metrics";
import type { Catalog, ResourceRow } from "./types";

const fetcher = apiFetcher<ResourceRow>("/api/resources");

const KIND_ICON: Record<Kind, React.ComponentType<{ className?: string }>> = {
  SERVER: Server,
  VPN: ShieldCheck,
  PROXY: Repeat,
  DOMAIN: Globe,
  SERVICE: AppWindow,
};

// Уровень срочности → вариант бейджа. Просрочка и «до 3 дней» одинаково
// красные: и то и другое требует действия сегодня.
const DUE_VARIANT = {
  overdue: "destructive",
  d3: "destructive",
  d7: "warning",
  d14: "info",
  later: "muted",
} as const;

function dueText(days: number, t: TFunc): string {
  if (days === 0) return t("due.today");
  if (days === 1) return t("due.tomorrow");
  // count положительный: формы множественного числа выбираются по величине.
  if (days < 0) return t("due.overdue", { count: -days });
  return t("due.in", { count: days });
}

const asDate = (ymd: string) => new Date(ymd + "T00:00:00Z");

export default function ResourcesPage() {
  const { can } = usePermissions();
  const { t, fmtDate, fmtNum } = useI18n();
  const { confirm } = useConfirm();

  const money = (amount: string, currency: string) => {
    const n = Number(amount);
    const s = isFinite(n) ? fmtNum(n, { minimumFractionDigits: 2 }) : amount;
    return `${s} ${currency}`;
  };
  const [reloadKey, setReloadKey] = useState(0);
  const [modal, setModal] = useState<{ open: boolean; row?: ResourceRow }>({ open: false });
  const [agent, setAgent] = useState<{ open: boolean; row?: ResourceRow }>({ open: false });
  const [catalog, setCatalog] = useState<Catalog>({ providers: [], tags: [], groups: [] });
  // Метрики всех машин одним запросом на страницу: значку в колонке нужен цвет
  // сразу, а не по наведению, и сотня строк не должна означать сотню запросов.
  const [systems, setSystems] = useState<Record<string, SystemView>>({});

  const loadSystems = useCallback(() => {
    apiFetch("/api/monitoring")
      .then((d: { systems: SystemView[] }) => {
        const map: Record<string, SystemView> = {};
        for (const s of d.systems) map[s.id] = s;
        setSystems(map);
      })
      .catch(() => {
        /* без метрик значок останется серым — таблица работает и так */
      });
  }, []);
  useEffect(() => {
    loadSystems();
    // Агенты шлют раз в минуту — чаще опрашивать нечего.
    const id = setInterval(loadSystems, 60_000);
    return () => clearInterval(id);
  }, [loadSystems]);

  const loadCatalog = useCallback(() => {
    apiFetch("/api/catalog")
      .then(setCatalog)
      .catch(() => {
        /* справочники не критичны для таблицы — форма покажет пустые списки */
      });
  }, []);
  useEffect(loadCatalog, [loadCatalog]);

  /**
   * Отметить оплату. Одна функция на колонку и на пункт меню: два одинаковых
   * обработчика разъехались бы при первой правке текста подтверждения.
   */
  const markPaid = async (row: ResourceRow) => {
    const ok = await confirm({
      title: t("res.action.pay"),
      description: t("res.confirm.pay", {
        name: row.name,
        date: fmtDate(asDate(row.nextPaymentAt)),
        amount: money(row.amount, row.currency),
      }),
      confirmText: t("res.action.pay"),
    });
    if (!ok) return;
    try {
      const d = await apiJson(`/api/resources/${row.id}/pay`, "POST", {});
      setReloadKey(k => k + 1);
      toast.success(t("res.toast.paid"), {
        description: t("res.toast.nextPayment", { date: fmtDate(asDate(d.nextPaymentAt)) }),
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const columns: Array<DataTableColumn<ResourceRow>> = [
    {
      id: "name",
      header: t("res.col.name"),
      sortable: true,
      cell: r => {
        const Icon = KIND_ICON[r.kind];
        // Под названием — то, что отличает именно этот тип: адрес, домен, ссылка.
        const sub = r.domain || r.url || (r.port ? `${r.ip}:${r.port}` : r.ip);
        return (
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={r.isActive ? "font-medium" : "font-medium text-muted-foreground"}>
                  {r.name}
                </span>
                {!r.isActive && <Badge variant="muted">{t("res.off")}</Badge>}
              </div>
              {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
            </div>
          </div>
        );
      },
    },
    {
      id: "kind",
      header: t("res.col.kind"),
      sortable: true,
      cell: r => <Badge variant="secondary">{kindLabel(r.kind, t)}</Badge>,
    },
    {
      id: "nextPaymentAt",
      header: t("res.col.due"),
      sortable: true,
      className: "tabular",
      cell: r => {
        const d = daysUntil(asDate(r.nextPaymentAt));
        return (
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-start gap-1">
              <span>{fmtDate(asDate(r.nextPaymentAt))}</span>
              <Badge variant={DUE_VARIANT[dueLevel(d)]}>{dueText(d, t)}</Badge>
            </div>
            {/* Отметка оплаты — самое частое действие в таблице, и держать его
                только в выпадающем меню значит прятать то, ради чего сюда
                заходят чаще всего. В меню оно тоже осталось. */}
            {can("resources.manage") && r.isActive && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => markPaid(r)}
                title={t("res.action.pay")}
                aria-label={t("res.action.pay")}
              >
                <CircleCheck />
              </Button>
            )}
          </div>
        );
      },
    },
    {
      id: "amount",
      header: t("res.col.amount"),
      sortable: true,
      className: "tabular",
      cell: r => (
        <div>
          <div className="font-medium">{money(r.amount, r.currency)}</div>
          <div className="text-xs text-muted-foreground">
            {periodText(r.periodValue, r.periodUnit, t)}
          </div>
        </div>
      ),
    },
    {
      id: "monitor",
      header: t("res.col.monitor"),
      // Колонка только для типов, где мониторинг осмыслен. У домена и подписки
      // нечего мерить, и пустая ячейка там честнее иконки-заглушки.
      cell: r =>
        MONITORABLE.includes(r.kind as any) ? (
          <MonitorCell
            row={r}
            system={systems[r.id]}
            onOpen={row => setAgent({ open: true, row })}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "provider",
      header: t("res.col.provider"),
      cell: r => (
        <div className="flex flex-col gap-1">
          {r.provider ? (
            <span className="text-sm">{r.provider.name}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {r.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {r.tags.map(tag => (
                <Badge key={tag.id} variant="outline">
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("res.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("res.subtitle")}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <DataTable<ResourceRow>
            columns={columns}
            fetcher={fetcher}
            rowKey={r => r.id}
            defaultSort={{ sort: "nextPaymentAt", order: "asc" }}
            searchPlaceholder={t("res.searchPlaceholder")}
            reloadKey={reloadKey}
            emptyText={t("res.empty")}
            filters={[
              {
                id: "due",
                label: t("res.filter.due"),
                options: [3, 7, 14].map(n => ({
                  value: String(n),
                  label: t("res.filter.dueIn", { count: n }),
                })),
              },
              { id: "kind", label: t("res.col.kind"), options: KINDS.map(k => ({ value: k, label: kindLabel(k, t) })) },
              {
                id: "providerId",
                label: t("res.filter.provider"),
                options: catalog.providers.map(p => ({ value: p.id, label: p.name })),
              },
              {
                id: "tagId",
                label: t("res.filter.tag"),
                options: catalog.tags.map(t => ({ value: t.id, label: t.name })),
              },
            ]}
            toolbar={
              can("resources.manage") ? (
                <Button onClick={() => setModal({ open: true })}>
                  <Plus />
                  {t("common.add")}
                </Button>
              ) : undefined
            }
            actions={[
              {
                label: t("res.action.pay"),
                permission: "resources.manage",
                // Тот же обработчик, что и у кнопки в колонке срока.
                onClick: row => markPaid(row),
              },
              {
                label: t("res.col.monitor"),
                permission: "resources.manage",
                hidden: row => !MONITORABLE.includes(row.kind as any),
                onClick: row => setAgent({ open: true, row }),
              },
              {
                label: t("common.edit"),
                permission: "resources.manage",
                onClick: row => setModal({ open: true, row }),
              },
              {
                label: t("common.delete"),
                permission: "resources.manage",
                variant: "destructive",
                onClick: async (row, rl) => {
                  const ok = await confirm({
                    title: t("common.delete"),
                    description: t("res.confirm.delete", { name: row.name }),
                    confirmText: t("common.yesDelete"),
                    destructive: true,
                  });
                  if (!ok) return;
                  try {
                    await apiJson(`/api/resources/${row.id}`, "DELETE");
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

      <AgentDialog
        open={agent.open}
        row={agent.row}
        onClose={() => setAgent({ open: false })}
        onChanged={() => setReloadKey(k => k + 1)}
      />

      <ResourceForm
        open={modal.open}
        row={modal.row}
        catalog={catalog}
        onClose={() => setModal({ open: false })}
        onSaved={() => setReloadKey(k => k + 1)}
        onCatalogChange={loadCatalog}
      />
    </div>
  );
}
