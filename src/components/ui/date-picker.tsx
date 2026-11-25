"use client";

import React, { useEffect, useRef, useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { useTheme } from "next-themes";
import { Calendar } from "vanilla-calendar-pro";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

import "vanilla-calendar-pro/styles/index.css";

export type DatePickerProps = {
  id?: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

function toDisplay(value: string, locale: string): string {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00Z`);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder,
  className,
  disabled,
}: DatePickerProps) {
  const { resolvedTheme } = useTheme();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const calRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<Calendar | null>(null);

  useEffect(() => {
    if (!open || !calRef.current) return;
    const cal = new Calendar(calRef.current, {
      selectedTheme: resolvedTheme === "dark" ? "dark" : "light",
      selectedDates: value ? [value] : [],
      selectionDatesMode: "single",
      onClickDate(self) {
        const date = self.context?.selectedDates?.[0];
        if (date) {
          onChange(date);
          setOpen(false);
        }
      },
    });
    cal.init();
    calendarRef.current = cal;
    return () => {
      cal.destroy();
      calendarRef.current = null;
    };
  }, [open, resolvedTheme, value, onChange]);

  const displayLocale = locale === "ru" ? "ru-RU" : "en-US";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 size-4 shrink-0" />
          <span className="truncate">
            {value
              ? toDisplay(value, displayLocale)
              : placeholder ||
                toDisplay(new Date().toISOString().slice(0, 10), displayLocale)}
          </span>
          {value && (
            <span
              role="button"
              tabIndex={0}
              aria-label="clear date"
              className="ml-auto inline-flex size-4 items-center justify-center rounded-sm opacity-50 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1"
              onClick={e => {
                e.stopPropagation();
                onChange("");
              }}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onChange("");
                }
              }}
            >
              <X className="size-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div ref={calRef} className="p-2" />
      </PopoverContent>
    </Popover>
  );
}
