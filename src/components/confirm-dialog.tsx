"use client";

// Подтверждения и разовые секреты — своим окном вместо confirm() и prompt().
//
// Дело не в красоте. Браузерное окно нельзя ни перевести, ни оформить: оно
// говорит «ОК/Отмена» на языке браузера, а не панели, показывает адрес сайта
// над текстом и в некоторых браузерах предлагает «больше не показывать
// диалоги» — после чего опасное действие выполняется молча. Опасную кнопку в
// нём тоже не выделить: удаление ресурса и подтверждение выхода выглядят
// одинаково.
//
// Обещание, а не колбэк, чтобы место вызова осталось читаемым:
//
//   if (!(await confirm({ title, description }))) return;
//
// Так порядок строк совпадает с порядком событий, и вокруг вызова не
// разрастается лесенка вложенных функций.

import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";

export type ConfirmOptions = {
  title: string;
  /** Подробности. Переводы строк сохраняются: в них обычно последствия. */
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** Необратимое действие — кнопка красная. */
  destructive?: boolean;
};

/** Разовый секрет: показывается один раз, копируется кнопкой. */
export type RevealOptions = {
  title: string;
  description?: string;
  value: string;
};

type Ctx = {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  reveal: (o: RevealOptions) => Promise<void>;
};

const ConfirmCtx = createContext<Ctx | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [confirmOpts, setConfirmOpts] = useState<ConfirmOptions | null>(null);
  const [revealOpts, setRevealOpts] = useState<RevealOptions | null>(null);
  const [copied, setCopied] = useState(false);
  // Разрешение обещания живёт в ref, а не в состоянии: его вызывают из
  // обработчика, и лишний рендер ради него не нужен.
  const resolveRef = useRef<((v: boolean) => void) | null>(null);
  const closeRef = useRef<(() => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setConfirmOpts(o);
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve;
    });
  }, []);

  const reveal = useCallback((o: RevealOptions) => {
    setRevealOpts(o);
    setCopied(false);
    return new Promise<void>(resolve => {
      closeRef.current = () => resolve();
    });
  }, []);

  /** Закрытие любым способом — это «нет»: Escape и клик мимо тоже отказ. */
  const settle = (value: boolean) => {
    setConfirmOpts(null);
    resolveRef.current?.(value);
    resolveRef.current = null;
  };

  const closeReveal = () => {
    setRevealOpts(null);
    closeRef.current?.();
    closeRef.current = null;
  };

  const copy = async () => {
    if (!revealOpts) return;
    try {
      await navigator.clipboard.writeText(revealOpts.value);
      setCopied(true);
    } catch {
      // Буфер недоступен без https или без разрешения. Значение видно и
      // выделяется мышью, так что это отсутствие удобства, а не ошибка.
    }
  };

  return (
    <ConfirmCtx.Provider value={{ confirm, reveal }}>
      {children}

      <Dialog open={!!confirmOpts} onOpenChange={v => !v && settle(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmOpts?.title}</DialogTitle>
            {confirmOpts?.description && (
              // whitespace-pre-line: в описании бывают абзацы про последствия,
              // и склеивать их в одну простыню — терять именно то, что читают.
              <DialogDescription className="whitespace-pre-line">
                {confirmOpts.description}
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => settle(false)}>
              {confirmOpts?.cancelText || t("common.cancel")}
            </Button>
            <Button
              variant={confirmOpts?.destructive ? "destructive" : "default"}
              onClick={() => settle(true)}
              autoFocus
            >
              {confirmOpts?.confirmText || t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revealOpts} onOpenChange={v => !v && closeReveal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{revealOpts?.title}</DialogTitle>
            {revealOpts?.description && (
              <DialogDescription>{revealOpts.description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all break-all rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm">
              {revealOpts?.value}
            </code>
            <Button variant="outline" size="icon" onClick={copy} aria-label={t("common.copy")}>
              {copied ? <Check className="text-success" /> : <Copy />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={closeReveal}>{t("common.done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmCtx.Provider>
  );
}

/**
 * Подтверждение и показ разового секрета.
 *
 * Вне провайдера возвращает безопасные заглушки: подтверждение — отказ, а не
 * молчаливое согласие. Забытый провайдер должен ломать сценарий заметно, но не
 * выполнять удаление без спроса.
 */
export function useConfirm(): Ctx {
  const ctx = useContext(ConfirmCtx);
  if (ctx) return ctx;
  return {
    confirm: async () => false,
    reveal: async () => {},
  };
}
