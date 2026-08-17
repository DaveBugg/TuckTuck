"use client";

// Telegram-оповещения: боты, их чаты и фильтры рассылки.
//
// Ботов может быть несколько — у каждого свой фильтр по типу ресурса и по
// тегам. Так потоки разводятся: боевые серверы в один чат, домены и подписки
// в другой.

import React, { useCallback, useEffect, useState } from "react";
import { Bell, Plus, Send, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, apiJson } from "@/lib/client-api";
import { kindLabel, KINDS } from "@/lib/resources";
import { useI18n } from "@/components/i18n-provider";
import { useConfirm } from "@/components/confirm-dialog";
import BotForm, { type BotRow } from "./BotForm";
import TelegramReachability from "./TelegramReachability";
import type { Catalog } from "../resources/types";

export default function NotificationsPage() {
  const { t } = useI18n();
  const { confirm } = useConfirm();
  const [rows, setRows] = useState<BotRow[] | null>(null);
  const [webhookBase, setWebhookBase] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({ providers: [], tags: [], groups: [] });
  const [modal, setModal] = useState<{ open: boolean; row?: BotRow }>({ open: false });
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    apiFetch("/api/notify/bots")
      .then(d => {
        setRows(d.rows);
        setWebhookBase(d.webhookBase);
      })
      .catch(e => {
        setRows([]);
        toast.error(e.message);
      });
    apiFetch("/api/catalog")
      .then(setCatalog)
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  const remove = async (b: BotRow) => {
    const ok = await confirm({
      title: t("common.delete"),
      description: t("notify.confirm.delete", { name: b.name }),
      confirmText: t("common.yesDelete"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiJson(`/api/notify/bots/${b.id}`, "DELETE");
      toast.success(t("notify.toast.deleted"));
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const test = async (b: BotRow) => {
    try {
      const d = await apiJson(`/api/notify/bots/${b.id}/test`, "POST");
      const bad = d.results.filter((r: any) => !r.ok);
      if (bad.length === 0) toast.success(t("notify.toast.sentTo", { count: d.results.length }));
      else
        toast.error(
          t("notify.toast.notDelivered", {
            list: bad.map((r: any) => `${r.chatId} — ${r.error}`).join("; "),
          })
        );
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const d = await apiJson("/api/notify/run", "POST");
      toast.success(
        t("notify.toast.runResult", {
          checked: d.checked,
          sent: d.sent,
          skipped: d.skipped,
          failed: d.failed,
        })
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("nav.notifications")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("notify.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runNow} disabled={running}>
            <Send />
            {running ? t("notify.sending") : t("notify.sendNow")}
          </Button>
          <Button onClick={() => setModal({ open: true })}>
            <Plus />
            {t("notify.addBot")}
          </Button>
        </div>
      </div>

      <TelegramReachability />

      {!webhookBase && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <b>{t("notify.noPublicUrl.title")}</b> {t("notify.noPublicUrl.text")}
        </div>
      )}

      {rows === null && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}

      {rows?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Bell className="size-8 text-muted-foreground" />
            <div>
              <div className="font-medium">{t("notify.empty.title")}</div>
              <p className="text-sm text-muted-foreground">{t("notify.empty.text")}</p>
            </div>
            <Button onClick={() => setModal({ open: true })}>
              <Plus />
              {t("notify.addBot")}
            </Button>
          </CardContent>
        </Card>
      )}

      {rows?.map(b => (
        <Card key={b.id}>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {b.name}
                {b.isActive ? (
                  <Badge variant="success">{t("notify.bot.on")}</Badge>
                ) : (
                  <Badge variant="muted">{t("notify.bot.off")}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {b.chats.length === 0
                  ? t("notify.bot.noChats")
                  : t("notify.bot.chatCount", { count: b.chats.length })}
              </CardDescription>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => test(b)} title={t("notify.bot.test")}>
                <Send />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => setModal({ open: true, row: b })} title={t("common.edit")}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => remove(b)} title={t("common.delete")}>
                <Trash2 />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <div className="mb-1 text-xs uppercase text-muted-foreground">{t("notify.bot.chats")}</div>
              <div className="flex flex-wrap gap-2">
                {b.chats.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
                {b.chats.map(c => (
                  <Badge key={c.id} variant="secondary">
                    {c.label ? `${c.label} · ` : ""}
                    {c.chatId}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs uppercase text-muted-foreground">{t("notify.bot.sends")}</div>
              <div className="flex flex-wrap gap-2">
                {b.kinds.length === 0 && b.tags.length === 0 ? (
                  <Badge variant="outline">{t("notify.bot.allResources")}</Badge>
                ) : (
                  <>
                    {b.kinds.map(k => (
                      <Badge key={k} variant="default">
                        {kindLabel(k as (typeof KINDS)[number], t)}
                      </Badge>
                    ))}
                    {b.tags.map(tag => (
                      <Badge key={tag.id} variant="outline">
                        #{tag.name}
                      </Badge>
                    ))}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <BotForm
        open={modal.open}
        row={modal.row}
        tags={catalog.tags}
        onClose={() => setModal({ open: false })}
        onSaved={load}
      />
    </div>
  );
}
