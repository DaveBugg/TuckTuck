"use client";

// Ядро списков TuckTuck: серверные данные, поиск, сортировка, фильтры,
// пагинация, действия строк и массовые действия с проверкой прав.
//
// Данные ВСЕГДА серверные: fetcher получает {page,pageSize,sort,order,search,
// filters} и возвращает {rows,total} — контракт совпадает с /api/* списками.
// Клиентской сортировки нет намеренно: она врала бы, показывая порядок в
// пределах страницы как порядок во всём наборе.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Loader2, MoreHorizontal, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/lib/use-permissions";
import { useI18n } from "@/components/i18n-provider";
import { apiFetch } from "@/lib/client-api";
import type { Permission } from "@/lib/permissions";

export type DataTableQuery = {
  page: number;
  pageSize: number;
  sort?: string;
  order?: "asc" | "desc";
  search?: string;
  filters: Record<string, string>;
};

export type DataTableResult<T> = { rows: T[]; total: number };

export type DataTableColumn<T> = {
  id: string; // ключ сортировки (whitelist на сервере)
  header: string;
  cell: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
};

export type DataTableRowAction<T> = {
  label: string;
  permission?: Permission;
  variant?: "destructive";
  hidden?: (row: T) => boolean;
  onClick: (row: T, reload: () => void) => void;
};

export type DataTableFilter = {
  id: string; // ключ в query.filters
  label: string;
  /** Помнить выбор между заходами на страницу (localStorage, ключ по id). */
  remember?: boolean;
  options: Array<{ value: string; label: string }>;
};

// Память фильтров. Ключ по id, чтобы две таблицы не перетирали друг друга.
// Всё в try/catch: приватный режим и переполненное хранилище бросают, а из-за
// настройки фильтра таблица падать не должна.
const rememberKey = (id: string) => `tt:dt:filter:${id}`;
const readRemembered = (id: string) => {
  try {
    return localStorage.getItem(rememberKey(id));
  } catch {
    return null;
  }
};
const writeRemembered = (id: string, v: string) => {
  try {
    if (v) localStorage.setItem(rememberKey(id), v);
    else localStorage.removeItem(rememberKey(id));
  } catch {
    /* ignore */
  }
};

// В Radix Select значение "" зарезервировано под «пусто», поэтому вариант
// «все» несёт свой маркер, а наружу отдаётся пустая строка.
const ALL = "__all__";

type Props<T> = {
  columns: Array<DataTableColumn<T>>;
  fetcher: (q: DataTableQuery) => Promise<DataTableResult<T>>;
  rowKey: (row: T) => string;
  actions?: Array<DataTableRowAction<T>>;
  filters?: DataTableFilter[];
  toolbar?: React.ReactNode;
  searchPlaceholder?: string;
  defaultSort?: { sort: string; order: "asc" | "desc" };
  pageSizeOptions?: number[];
  emptyText?: string;
  /** Инкремент — внешний триггер перезагрузки (после создания записи и т.п.). */
  reloadKey?: number;
};

export default function DataTable<T>({
  columns,
  fetcher,
  rowKey,
  actions = [],
  filters = [],
  toolbar,
  searchPlaceholder,
  defaultSort,
  pageSizeOptions = [10, 25, 50, 100],
  emptyText,
  reloadKey = 0,
}: Props<T>) {
  const { can } = usePermissions();
  // Значения по умолчанию берутся из словаря здесь, а не в сигнатуре: там они
  // вычислялись бы один раз при загрузке модуля, до того как язык известен.
  const { t, fmtNum } = useI18n();

  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeOptions[0] ?? 10);
  const [sort, setSort] = useState<string | undefined>(defaultSort?.sort);
  const [order, setOrder] = useState<"asc" | "desc">(defaultSort?.order ?? "desc");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [innerReload, setInnerReload] = useState(0);

  // Восстановление запомненного фильтра. НЕ в инициализаторе useState:
  // localStorage на сервере нет, и чтение там разошлось бы с гидрацией.
  const remembered = filters.find(f => f.remember);
  const optionsCount = remembered?.options.length ?? 0;
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !remembered || optionsCount === 0) return;
    restoredRef.current = true;
    const v = readRemembered(remembered.id);
    if (v && remembered.options.some(o => o.value === v)) {
      setFilterValues(fv => ({ ...fv, [remembered.id]: v }));
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsCount]);

  // Дебаунс поиска: без него каждый символ уходил бы запросом на сервер.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const reload = useCallback(() => setInnerReload(x => x + 1), []);

  useEffect(() => {
    const q: DataTableQuery = { page, pageSize, sort, order, search, filters: filterValues };
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher(q)
      .then(r => {
        if (cancelled) return;
        setRows(r.rows);
        setTotal(r.total);
      })
      .catch((e: any) => !cancelled && setError(e?.message || t("table.loadError")))
      .finally(() => !cancelled && setLoading(false));
    // Отменяем применение ответа, а не сам запрос: пока летит медленный,
    // пользователь мог сменить фильтр, и «догнавший» старый ответ перетёр бы
    // свежие данные.
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sort, order, search, filterValues, innerReload, reloadKey]);

  const toggleSort = (col: DataTableColumn<T>) => {
    if (!col.sortable) return;
    if (sort === col.id) setOrder(o => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(col.id);
      setOrder("asc");
    }
    setPage(1);
  };

  const visibleActions = actions.filter(a => !a.permission || can(a.permission));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Оконная пагинация: 1 … (p-1 p p+1) … last
  const pageItems = useMemo(() => {
    const items: Array<number | "…"> = [];
    for (let i = 1; i <= pageCount; i++) {
      if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) items.push(i);
      else if (items[items.length - 1] !== "…") items.push("…");
    }
    return items;
  }, [page, pageCount]);

  const colCount = columns.length + (visibleActions.length ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Панель управления: поиск, фильтры, кнопки страницы */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder={searchPlaceholder ?? t("table.search")}
            className="pl-8"
          />
        </div>

        {filters.map(f => (
          <Select
            key={f.id}
            value={filterValues[f.id] || ALL}
            onValueChange={v => {
              const val = v === ALL ? "" : v;
              if (f.remember) writeRemembered(f.id, val);
              setFilterValues(prev => ({ ...prev, [f.id]: val }));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-auto min-w-36">
              <SelectValue placeholder={f.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("table.filterAll", { label: f.label })}</SelectItem>
              {f.options.map(o => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        <div className="ml-auto">{toolbar}</div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map(c => (
                <TableHead key={c.id} className={c.className}>
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c)}
                      className="inline-flex items-center gap-1 uppercase transition-colors hover:text-foreground"
                    >
                      {c.header}
                      {sort === c.id ? (
                        order === "asc" ? (
                          <ArrowUp className="size-3.5" />
                        ) : (
                          <ArrowDown className="size-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3.5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </TableHead>
              ))}
              {visibleActions.length > 0 && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Скелет только на ПЕРВОЙ загрузке. При смене страницы строки
                остаются на месте, иначе таблица прыгает на каждый клик. */}
            {loading && rows.length === 0 &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {Array.from({ length: colCount }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!loading && rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colCount} className="py-10 text-center text-muted-foreground">
                  {emptyText ?? t("table.empty")}
                </TableCell>
              </TableRow>
            )}

            {rows.map(r => (
              <TableRow key={rowKey(r)}>
                {columns.map(c => (
                  <TableCell key={c.id} className={c.className}>
                    {c.cell(r)}
                  </TableCell>
                ))}
                {visibleActions.length > 0 && (
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={t("table.rowActions")}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {visibleActions
                          .filter(a => !a.hidden?.(r))
                          .map(a => (
                            <DropdownMenuItem
                              key={a.label}
                              variant={a.variant}
                              onClick={() => a.onClick(r, reload)}
                            >
                              {a.label}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {t("table.shown", { shown: fmtNum(rows.length), total: fmtNum(total) })}
        </span>

        <Select
          value={String(pageSize)}
          onValueChange={v => {
            setPageSize(Number(v));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map(n => (
              <SelectItem key={n} value={String(n)}>
                {t("table.perPage", { n })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            aria-label={t("table.prevPage")}
          >
            ←
          </Button>
          {pageItems.map((it, i) =>
            it === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={it}
                variant={it === page ? "default" : "outline"}
                size="icon-sm"
                onClick={() => setPage(it)}
              >
                {it}
              </Button>
            )
          )}
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= pageCount}
            onClick={() => setPage(p => Math.min(pageCount, p + 1))}
            aria-label={t("table.nextPage")}
          >
            →
          </Button>
        </div>
      </div>
    </div>
  );
}

export function buildListParams(q: DataTableQuery): URLSearchParams {
  const params = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize) });
  if (q.sort) params.set("sort", q.sort);
  if (q.order) params.set("order", q.order);
  if (q.search) params.set("search", q.search);
  Object.entries(q.filters).forEach(([k, v]) => v && params.set(k, v));
  return params;
}

/** Стандартный fetcher под наши /api/* списки (401 → редирект на логин в apiFetch). */
export function apiFetcher<T>(endpoint: string) {
  return async (q: DataTableQuery): Promise<DataTableResult<T>> => {
    const data = await apiFetch(`${endpoint}?${buildListParams(q).toString()}`);
    return { rows: data.rows, total: data.total };
  };
}
