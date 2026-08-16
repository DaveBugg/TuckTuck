"use client";

// Дашборд: расход за месяц сверху, ближайшие оплаты слева, здоровье серверов
// справа.
//
// Приветствия и подзаголовка тут нет намеренно: экран открывают, чтобы увидеть
// цифры, а не поздороваться. Верхние две строки съедали первый экран на
// ноутбуке и не сообщали ничего.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, ExternalLink, CircleCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, apiJson } from "@/lib/client-api";
import { toast } from "sonner";
import { usePermissions } from "@/lib/use-permissions";
import { kindLabel, daysUntil, dueLevel, KINDS } from "@/lib/resources";
import { useI18n } from "@/components/i18n-provider";
import type { TFunc } from "@/lib/i18n/translate";
import MonitoringCard from "./MonitoringCard";
import SpendCard from "./SpendCard";
import type { ResourceRow } from "../resources/types";

const DUE_VARIANT = {
  overdue: "destructive",
  d3: "destructive",
  d7: "warning",
  d14: "info",
  later: "muted",
} as const;

const asDate = (ymd: string) => new Date(ymd + "T00:00:00Z");

// Сколько строк показывать. Десять по умолчанию: список прокручивается внутри
// карточки, поэтому длина больше не растягивает страницу, а на десяти уже видно
// весь ближайший месяц.
const SIZES = [10, 15, 20] as const;
const ALL_KINDS = "__all__"; // Radix Select не принимает "" как значение пункта

function dueText(days: number, t: TFunc) {
  if (days === 0) return t("due.today");
  if (days === 1) return t("due.tomorrow");
  // count передаём положительным: правила множественного числа считают по
  // величине, а «просрочено на −3 дня» получилось бы не в той форме.
  if (days < 0) return t("due.overdue", { count: -days });
  return t("due.in", { count: days });
}

export default function DashboardPage() {
  const { can } = usePermissions();
  const { t, fmtNum, fmtDate } = useI18n();
  const [rows, setRows] = useState<ResourceRow[] | null>(null);
  const [size, setSize] = useState<number>(SIZES[0]);
  const [kind, setKind] = useState<string>(ALL_KINDS);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  // Отметка оплаты меняет и этот список, и суммы в виджете расхода рядом.
  // Ключ поднят сюда, чтобы обновились оба, а не только тот, где нажали.
  const [reloadKey, setReloadKey] = useState(0);

  // Зависимость — БУЛЕВО право, а не функция can: даже стабильная функция
  // меняется при смене роли, а список надо перезапрашивать только когда
  // доступ реально появился или пропал.
  const mayView = can("resources.view");

  // Ввод не дёргает сервер на каждую букву: у списка оплат нет подсказок, ради
  // которых стоило бы отвечать мгновенно.
  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(() => {
    if (!mayView) return;
    const p = new URLSearchParams({ pageSize: String(size) });
    if (kind !== ALL_KINDS) p.set("kind", kind);
    if (query) p.set("search", query);
    // Список уже отсортирован сервером по ближайшей дате оплаты.
    apiFetch(`/api/resources?${p}`)
      .then(d => setRows(d.rows))
      .catch(() => setRows([]));
  }, [mayView, size, kind, query, reloadKey]);

  useEffect(load, [load]);

  /**
   * Отметить оплату прямо отсюда.
   *
   * Подтверждение обязательно: действие пишет платёж в историю и двигает дату
   * на период, а промах по кнопке в списке — дело одной секунды.
   */
  const markPaid = async (r: ResourceRow) => {
    if (
      !confirm(
        t("res.confirm.pay", {
          name: r.name,
          date: fmtDate(asDate(r.nextPaymentAt)),
          amount: `${fmtNum(Number(r.amount), { minimumFractionDigits: 2 })} ${r.currency}`,
        })
      )
    ) {
      return;
    }
    try {
      const d = await apiJson(`/api/resources/${r.id}/pay`, "POST", {});
      toast.success(t("res.toast.paid"), {
        description: t("res.toast.nextPayment", { date: fmtDate(asDate(d.nextPaymentAt)) }),
      });
      setReloadKey(k => k + 1);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const kindOptions = useMemo(
    () => KINDS.map(k => ({ value: k, label: kindLabel(k, t) })),
    [t]
  );

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      {can("resources.view") && <SpendCard reloadKey={reloadKey} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("dashboard.upcoming")}</CardTitle>
            {can("resources.view") && (
              <Link
                href="/resources"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                {t("dashboard.allResources")} <ArrowRight className="size-3.5" />
              </Link>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {can("resources.view") && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-40 flex-1">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-8 pl-8"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={t("dashboard.searchPlaceholder")}
                    aria-label={t("dashboard.searchPlaceholder")}
                  />
                </div>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger className="h-8 w-auto min-w-32" aria-label={t("res.col.kind")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_KINDS}>{t("dashboard.allKinds")}</SelectItem>
                    {kindOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(size)} onValueChange={v => setSize(Number(v))}>
                  <SelectTrigger className="h-8 w-auto" aria-label={t("dashboard.show")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZES.map(n => (
                      <SelectItem key={n} value={String(n)}>
                        {t("dashboard.showCount", { count: n })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!can("resources.view") && (
              <p className="text-sm text-muted-foreground">{t("dashboard.noAccess")}</p>
            )}
            {can("resources.view") && rows === null && (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            )}
            {rows?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {/* Пусто из-за фильтра и пусто вообще — разные новости, и
                    предлагать «добавьте первый ресурс» тому, кто просто ищет
                    не то слово, значит сбивать с толку. */}
                {query || kind !== ALL_KINDS ? (
                  t("dashboard.nothingFound")
                ) : (
                  <>
                    {t("dashboard.emptyResources")}{" "}
                    <Link href="/resources" className="text-primary hover:underline">
                      {t("dashboard.addFirst")}
                    </Link>
                  </>
                )}
              </p>
            )}
            {rows && rows.length > 0 && (
              // Прокрутка внутри карточки — как у соседнего виджета серверов:
              // иначе двадцать строк уводят страницу вниз, и здоровье машин
              // справа оказывается за экраном. pr-1 — зазор, чтобы ползунок не
              // прилипал к бейджам срока.
              <ul className="flex max-h-[60vh] flex-col divide-y overflow-y-auto pr-1">
                {rows.map(r => {
                  const d = daysUntil(asDate(r.nextPaymentAt));
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {kindLabel(r.kind, t)}
                          {/* Провайдер здесь потому, что платить идут к нему, а
                              не к ресурсу: «Hetzner» отвечает на вопрос «куда
                              теперь», а тип — нет. */}
                          {r.provider && <> · {r.provider.name}</>}
                        </div>
                      </div>
                      {r.provider?.url && (
                        <Button
                          asChild
                          variant="ghost"
                          size="icon-sm"
                          title={t("dashboard.openProvider", { name: r.provider.name })}
                        >
                          <a href={r.provider.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink />
                          </a>
                        </Button>
                      )}
                      <div className="tabular text-sm">
                        {fmtNum(Number(r.amount), { minimumFractionDigits: 2 })} {r.currency}
                      </div>
                      <Badge variant={DUE_VARIANT[dueLevel(d)]}>{dueText(d, t)}</Badge>
                      {can("resources.manage") && (
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
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <MonitoringCard />
      </div>
    </div>
  );
}
