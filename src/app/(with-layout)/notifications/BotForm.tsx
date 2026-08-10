"use client";

// Форма бота: токен, чаты, фильтры. Токен наружу никогда не отдаётся, поэтому
// при правке поле пустое и означает «не менять».

import React, { useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiJson } from "@/lib/client-api";
import { KINDS, kindLabel } from "@/lib/resources";
import { useI18n } from "@/components/i18n-provider";
import type { TagRow } from "../resources/types";

export type BotRow = {
  id: string;
  name: string;
  isActive: boolean;
  kinds: string[];
  chats: Array<{ id: string; chatId: string; label: string; allowedUserIds: string[] }>;
  tags: Array<{ id: string; name: string }>;
  /** Замаскированный адрес; пусто = берётся общий. Сам адрес наружу не отдаётся. */
  proxy?: string;
};

type ChatDraft = { chatId: string; label: string; allowed: string };

export default function BotForm({
  open,
  row,
  tags,
  onClose,
  onSaved,
}: {
  open: boolean;
  row?: BotRow;
  tags: TagRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [kinds, setKinds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [chats, setChats] = useState<ChatDraft[]>([]);
  const [proxyUrl, setProxyUrl] = useState("");
  const [newChat, setNewChat] = useState<ChatDraft>({ chatId: "", label: "", allowed: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setToken("");
    setProxyUrl("");
    setNewChat({ chatId: "", label: "", allowed: "" });
    if (row) {
      setName(row.name);
      setIsActive(row.isActive);
      setKinds(row.kinds);
      setTagIds(row.tags.map(t => t.id));
      setChats(
        row.chats.map(c => ({
          chatId: c.chatId,
          label: c.label,
          allowed: (c.allowedUserIds || []).join(", "),
        }))
      );
    } else {
      setName("");
      setIsActive(true);
      setKinds([]);
      setTagIds([]);
      setChats([]);
    }
  }, [open, row]);

  const addChat = () => {
    const id = newChat.chatId.trim();
    if (!id) return;
    if (chats.some(c => c.chatId === id)) {
      toast.error(t("notify.form.chatExists"));
      return;
    }
    setChats([
      ...chats,
      { chatId: id, label: newChat.label.trim(), allowed: newChat.allowed.trim() },
    ]);
    setNewChat({ chatId: "", label: "", allowed: "" });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (chats.length === 0) {
      toast.error(t("notify.form.needChat"));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name,
        token,
        isActive,
        kinds,
        tagIds,
        // Пустая строка тоже осмысленна: «этому боту — общий прокси».
        proxyUrl: proxyUrl.trim(),
        chats: chats.map(c => ({
          chatId: c.chatId,
          label: c.label,
          allowedUserIds: c.allowed
            .split(/[,\s]+/)
            .map(v => v.trim())
            .filter(Boolean),
        })),
      };
      const d = row
        ? await apiJson(`/api/notify/bots/${row.id}`, "PATCH", payload)
        : await apiJson("/api/notify/bots", "POST", payload);
      toast.success(row ? t("common.saved") : t("notify.form.botAdded", { username: d.username }));
      if (d.webhook && d.webhook !== "ok") {
        // Бот создан, но кнопки работать не будут — это надо сказать прямо,
        // а не прятать за общим «сохранено».
        toast.warning(t("notify.form.webhookFailed", { detail: d.webhook }));
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{row ? t("notify.form.editTitle", { name: row.name }) : t("notify.form.newTitle")}</DialogTitle>
            <DialogDescription>
              {t("notify.form.hint")}
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="bf-name">{t("res.form.name")}</Label>
            <Input
              id="bf-name"
              className="mt-1.5"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t("notify.form.namePlaceholder")}
              required
            />
          </div>

          <div>
            <Label htmlFor="bf-token">{t("notify.form.token")}</Label>
            <Input
              id="bf-token"
              className="mt-1.5 font-mono text-xs"
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder={row ? t("notify.form.tokenKeep") : "123456:ABC-DEF…"}
              required={!row}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("notify.form.tokenHint")}
            </p>
          </div>

          <div>
            <Label>{t("notify.bot.chats")}</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {chats.length === 0 && (
                <span className="text-sm text-muted-foreground">{t("common.emptyYet")}</span>
              )}
              {chats.map(c => (
                <Badge key={c.chatId} variant="secondary" className="gap-1 py-1">
                  {c.label ? `${c.label} · ` : ""}
                  {c.chatId}
                  {c.allowed ? " · 🔒" : ""}
                  <button
                    type="button"
                    onClick={() => setChats(chats.filter(x => x.chatId !== c.chatId))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={t("notify.form.removeChat")}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                className="h-8 max-w-44"
                value={newChat.chatId}
                onChange={e => setNewChat({ ...newChat, chatId: e.target.value })}
                placeholder="chat_id"
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChat();
                  }
                }}
              />
              <Input
                className="h-8"
                value={newChat.label}
                onChange={e => setNewChat({ ...newChat, label: e.target.value })}
                placeholder={t("notify.form.chatLabel")}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChat();
                  }
                }}
              />
              <Button type="button" variant="outline" size="icon-sm" onClick={addChat}>
                <Plus />
              </Button>
            </div>
            <Input
              className="mt-2 h-8"
              value={newChat.allowed}
              onChange={e => setNewChat({ ...newChat, allowed: e.target.value })}
              placeholder={t("notify.form.allowedIds")}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addChat();
                }
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("notify.form.chatIdHint")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("notify.form.allowedHint")}
            </p>
          </div>

          <div>
            <Label>{t("notify.form.kinds")}</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {KINDS.map(k => {
                const on = kinds.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggle(kinds, setKinds, k)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                      on
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    {on && <Check className="size-3" />}
                    {kindLabel(k, t)}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("notify.form.kindsHint")}
            </p>
          </div>

          <div>
            <Label>{t("res.form.tags")}</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {tags.length === 0 && <span className="text-sm text-muted-foreground">{t("notify.form.noTags")}</span>}
              {tags.map(tag => {
                const on = tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggle(tagIds, setTagIds, tag.id)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                      on
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    {on && <Check className="size-3" />}
                    {tag.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("notify.form.tagsHint")}
            </p>
          </div>

          <div>
            <Label htmlFor="bf-proxy">{t("notify.form.proxy")}</Label>
            <Input
              id="bf-proxy"
              className="mt-1.5 font-mono text-xs"
              value={proxyUrl}
              onChange={e => setProxyUrl(e.target.value)}
              placeholder={
                row?.proxy
                  ? t("notify.form.proxyCurrent", { proxy: row.proxy })
                  : "socks5://user:pass@host:port"
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("notify.form.proxyHint")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="bf-active" checked={isActive} onCheckedChange={setIsActive} />
            <Label htmlFor="bf-active" className="font-normal">
              {t("notify.form.enabled")}
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
