"use client";

// Селект с поиском.
//
// Нужен там, где вариантов больше, чем помещается в голове: валют два десятка,
// часовых поясов — четыре сотни. В обычном списке пояс ищут прокруткой, и это
// единственное место в панели, где настройка занимает минуту вместо секунды.
//
// Без cmdk и прочих комбобокс-библиотек: всё поведение — фильтр по подстроке и
// стрелки с Enter, это полсотни строк, а зависимость пришлось бы тащить и
// обновлять ради одного экрана.

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type SearchOption = {
  value: string;
  label: string;
  /** Дополнительная строка для поиска: смещение пояса, название валюты. */
  hint?: string;
};

export function SearchSelect({
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  className,
  contentClassName,
  disabled,
  ariaLabel,
}: {
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  const current = options.find(o => o.value === value);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      o =>
        o.value.toLowerCase().includes(q) ||
        o.label.toLowerCase().includes(q) ||
        (o.hint || "").toLowerCase().includes(q)
    );
  }, [options, query]);

  // При открытии показываем выбранное, а не начало списка: в четырёхстах поясах
  // «где я сейчас» иначе не найти.
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const i = options.findIndex(o => o.value === value);
    setActive(i < 0 ? 0 : i);
  }, [open, options, value]);

  React.useEffect(() => {
    setActive(0);
  }, [query]);

  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!filtered.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive(i => (i + step + filtered.length) % filtered.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) pick(opt.value);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !current && "text-muted-foreground")}>
            {current ? current.label : placeholder || ""}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className={cn("w-(--radix-popover-trigger-width) min-w-56 p-0", contentClassName)}
        onOpenAutoFocus={e => {
          // Фокус сразу в поле поиска: открыли — печатаем, а не ищем мышью,
          // куда кликнуть.
          e.preventDefault();
          (e.currentTarget as HTMLElement).querySelector("input")?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b px-2.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder || ""}
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div ref={listRef} className="max-h-64 overflow-y-auto p-1" role="listbox">
          {filtered.length === 0 && (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              {emptyText || ""}
            </div>
          )}
          {filtered.map((o, i) => (
            <button
              key={o.value}
              type="button"
              data-idx={i}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o.value)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none",
                i === active && "bg-accent text-accent-foreground"
              )}
            >
              {o.value === value ? (
                <Check className="size-4 shrink-0 text-primary" />
              ) : (
                <span className="size-4 shrink-0" />
              )}
              <span className="truncate">{o.label}</span>
              {o.hint && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{o.hint}</span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default SearchSelect;
