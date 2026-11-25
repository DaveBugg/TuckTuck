"use client";

// Форма бота: токен, чаты, фильтры. Токен наружу никогда не отдаётся, поэтому
// при правке поле пустое и означает «не менять».

import React, { useEffect, useMemo, useState } from "react";
import { Check, Plus, X, Search } from "lucide-react";
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
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  chats: Array<{
    id: string;
    chatId: string;
    label: string;
    allowedMode: string;
    allowedProjectId: string | null;
    allowedUserIds: string[];
  }>;
  tags: Array<{ id: string; name: string }>;
  /** Замаскированный адрес; пусто = берётся общий. Сам адрес наружу не отдаётся. */
  proxy?: string;
};

type ProjectOption = { id: string; name: string };

type UserOption = {
  id: string;
  name: string;
  email: string;
  telegramUserId: string | null;
};

type ChatMode = "all" | "project" | "users";

type ChatDraft = {
  chatId: string;
  label: string;
  allowedMode: ChatMode;
  allowedProjectId: string | null;
  allowedUserIds: string[];
};

const MODES: ChatMode[] = ["all", "project", "users"];

function modeIcon(mode: ChatMode) {
  if (mode === "all") return "👥";
  if (mode === "project") return "📁";
  return "🔒";
}

function useTelegramUsers(enabled: boolean) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    apiJson("/api/users?hasTelegram=true&pageSize=1000", "GET")
      .then((d: any) => {
        if (cancelled) return;
        setUsers(
          (d.rows || []).map((u: any) => ({
            id: u.id,
            name: u.name || "",
            email: u.email || "",
            telegramUserId: u.telegramUserId ? String(u.telegramUserId) : null,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { users, loading };
}

function useProjects(enabled: boolean) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    apiJson("/api/finance/projects?archived=false&pageSize=1000", "GET")
      .then((d: any) => {
        if (cancelled) return;
        setProjects(
          (d.rows || []).map((p: any) => ({ id: p.id, name: p.name }))
        );
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return projects;
}

function UserMultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
}: {
  options: UserOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      o => o.name.toLowerCase().includes(q) || o.email.toLowerCase().includes(q)
    );
  }, [options, query]);

  const selectedUsers = useMemo(
    () => options.filter(o => selected.includes(o.id)),
    [options, selected]
  );

  const toggle = (id: string) => {
    onChange(
      selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-9 w-full justify-start gap-1 font-normal"
        >
          {selectedUsers.length === 0 ? (
            <span className="text-muted-foreground">{placeholder || ""}</span>
          ) : (
            selectedUsers.map(u => (
              <Badge
                key={u.id}
                variant="secondary"
                className="gap-1"
                onClick={e => {
                  e.stopPropagation();
                  toggle(u.id);
                }}
              >
                {u.name || u.email}
                <X className="size-3" />
              </Badge>
            ))
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="flex items-center gap-2 border-b px-2.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={searchPlaceholder || ""}
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              {emptyText || ""}
            </div>
          )}
          {filtered.map(u => {
            const on = selected.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.id)}
                className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="mt-0.5">
                  {on ? (
                    <Check className="size-4 text-primary" />
                  ) : (
                    <span className="size-4" />
                  )}
                </span>
                <span className="flex flex-col">
                  <span>{u.name || u.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {u.email}
                    {u.telegramUserId
                      ? ` · ${t("notify.form.tgLinked")}`
                      : ` · ${t("notify.form.tgNotLinked")}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
  const [newChat, setNewChat] = useState<ChatDraft>({
    chatId: "",
    label: "",
    allowedMode: "users",
    allowedProjectId: null,
    allowedUserIds: [],
  });
  const [busy, setBusy] = useState(false);

  const { users } = useTelegramUsers(open);
  const projects = useProjects(open);

  useEffect(() => {
    if (!open) return;
    setToken("");
    setProxyUrl("");
    setNewChat({
      chatId: "",
      label: "",
      allowedMode: "users",
      allowedProjectId: null,
      allowedUserIds: [],
    });
    if (row) {
      setName(row.name);
      setIsActive(row.isActive);
      setKinds(row.kinds);
      setTagIds(row.tags.map(t => t.id));
      setChats(
        row.chats.map(c => {
          const mode: ChatMode =
            (c.allowedMode as ChatMode) ||
            ((c.allowedUserIds || []).length ? "users" : "all");
          return {
            chatId: c.chatId,
            label: c.label,
            allowedMode: mode,
            allowedProjectId: c.allowedProjectId || null,
            allowedUserIds: c.allowedUserIds || [],
          };
        })
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
    if (newChat.allowedMode === "project" && !newChat.allowedProjectId) {
      toast.error(t("notify.err.projectIdRequired"));
      return;
    }
    if (
      newChat.allowedMode === "users" &&
      newChat.allowedUserIds.length === 0
    ) {
      toast.error(t("notify.err.allowedUsersRequired"));
      return;
    }
    setChats([
      ...chats,
      { ...newChat, chatId: id, label: newChat.label.trim() },
    ]);
    setNewChat({
      chatId: "",
      label: "",
      allowedMode: "users",
      allowedProjectId: null,
      allowedUserIds: [],
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
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
          allowedMode: c.allowedMode,
          allowedProjectId: c.allowedProjectId,
          allowedUserIds: c.allowedUserIds,
        })),
      };
      const d = row
        ? await apiJson(`/api/notify/bots/${row.id}`, "PATCH", payload)
        : await apiJson("/api/notify/bots", "POST", payload);
      toast.success(
        row
          ? t("common.saved")
          : t("notify.form.botAdded", { username: d.username })
      );
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

  const projectName = (id: string | null) =>
    projects.find(p => p.id === id)?.name || "";

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {row
                ? t("notify.form.editTitle", { name: row.name })
                : t("notify.form.newTitle")}
            </DialogTitle>
            <DialogDescription>{t("notify.form.hint")}</DialogDescription>
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
            <PasswordInput
              id="bf-token"
              className="mt-1.5 font-mono text-xs"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder={row ? t("notify.form.tokenKeep") : "123456:ABC-DEF…"}
              required={!row}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("notify.form.tokenHint")}
            </p>
          </div>

          <div className="rounded-lg border p-3">
            <Label className="font-medium">
              {t("notify.form.chatPurpose")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("notify.form.chatPurposeHint")}
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {chats.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  {t("common.emptyYet")}
                </span>
              )}
              {chats.map(c => (
                <Badge
                  key={c.chatId}
                  variant="secondary"
                  className="gap-1 py-1"
                >
                  {c.label ? `${c.label} · ` : ""}
                  {c.chatId} {modeIcon(c.allowedMode)}
                  <button
                    type="button"
                    onClick={() =>
                      setChats(chats.filter(x => x.chatId !== c.chatId))
                    }
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={t("notify.form.removeChat")}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>

            <Separator className="my-3" />

            <div className="grid gap-3">
              <div className="flex gap-2">
                <Input
                  className="h-8 max-w-44"
                  value={newChat.chatId}
                  onChange={e =>
                    setNewChat({ ...newChat, chatId: e.target.value })
                  }
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
                  onChange={e =>
                    setNewChat({ ...newChat, label: e.target.value })
                  }
                  placeholder={t("notify.form.chatLabel")}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addChat();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={addChat}
                >
                  <Plus />
                </Button>
              </div>

              <div>
                <Label className="text-xs font-normal text-muted-foreground">
                  {t("notify.form.allowedMode")}
                </Label>
                <Select
                  value={newChat.allowedMode}
                  onValueChange={(v: ChatMode) =>
                    setNewChat({
                      ...newChat,
                      allowedMode: v,
                      allowedProjectId: null,
                      allowedUserIds: [],
                    })
                  }
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODES.map(m => (
                      <SelectItem key={m} value={m}>
                        {modeIcon(m)} {t(`notify.form.allowedMode.${m}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {newChat.allowedMode === "project" && (
                <div>
                  <Label className="text-xs font-normal text-muted-foreground">
                    {t("notify.form.allowedProject")}
                  </Label>
                  <Select
                    value={newChat.allowedProjectId ?? "__none__"}
                    onValueChange={v =>
                      setNewChat({
                        ...newChat,
                        allowedProjectId: v === "__none__" ? null : v,
                      })
                    }
                  >
                    <SelectTrigger className="mt-1 h-8">
                      <SelectValue
                        placeholder={t("finance.projects.searchPlaceholder")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        {t("common.nothingFound")}
                      </SelectItem>
                      {projects.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {newChat.allowedMode === "users" && (
                <div>
                  <Label className="text-xs font-normal text-muted-foreground">
                    {t("notify.form.allowedUsers")}
                  </Label>
                  <div className="mt-1">
                    <UserMultiSelect
                      options={users}
                      selected={newChat.allowedUserIds}
                      onChange={ids =>
                        setNewChat({ ...newChat, allowedUserIds: ids })
                      }
                      placeholder={t("notify.form.userSearchPlaceholder")}
                      searchPlaceholder={t("notify.form.userSearchPlaceholder")}
                      emptyText={t("notify.form.noUsers")}
                    />
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {t("notify.form.chatIdHint")}
              </p>
            </div>
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
              {tags.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  {t("notify.form.noTags")}
                </span>
              )}
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
            <Switch
              id="bf-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
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
