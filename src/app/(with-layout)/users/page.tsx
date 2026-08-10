"use client";

// Пользователи системы (ADMIN): список + создание, смена роли, деактивация,
// сброс пароля.

import React, { useEffect, useState } from "react";
import { Plus, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import DataTable, { apiFetcher, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiJson } from "@/lib/client-api";
import { useCurrentUser, usePermissions } from "@/lib/use-permissions";
import { useI18n } from "@/components/i18n-provider";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  isActive: boolean;
  totpEnabled: boolean;
  createdAt: string;
  _count: { sessions: number };
};

const fetcher = apiFetcher<UserRow>("/api/users");
const ROLES = ["ADMIN", "USER"] as const;
const emptyForm = { email: "", name: "", role: "USER", password: "", isActive: true };

export default function UsersPage() {
  const { can } = usePermissions();
  const { t, fmtDate } = useI18n();
  const me = useCurrentUser();
  const [reloadKey, setReloadKey] = useState(0);
  const [modal, setModal] = useState<{ open: boolean; row?: UserRow }>({ open: false });
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!modal.open) return;
    setForm(
      modal.row
        ? {
            email: modal.row.email,
            name: modal.row.name,
            role: modal.row.role,
            password: "",
            isActive: modal.row.isActive,
          }
        : emptyForm
    );
  }, [modal]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (modal.row) {
        await apiJson(`/api/users/${modal.row.id}`, "PATCH", {
          name: form.name,
          role: form.role,
          isActive: form.isActive,
        });
      } else {
        await apiJson("/api/users", "POST", form);
      }
      toast.success(modal.row ? t("common.saved") : t("users.created"));
      setModal({ open: false });
      setReloadKey(k => k + 1);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const columns: Array<DataTableColumn<UserRow>> = [
    {
      id: "email",
      header: t("users.col.user"),
      sortable: true,
      cell: r => (
        <div className="flex items-center gap-3">
          <span
            className={
              r.role === "ADMIN"
                ? "flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
                : "flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
            }
          >
            {r.role === "ADMIN" ? <ShieldCheck className="size-4" /> : <User className="size-4" />}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{r.name || r.email}</div>
            <div className="truncate text-xs text-muted-foreground">{r.email}</div>
          </div>
        </div>
      ),
    },
    {
      id: "role",
      header: t("users.col.role"),
      sortable: true,
      cell: r => <Badge variant={r.role === "ADMIN" ? "destructive" : "secondary"}>{r.role}</Badge>,
    },
    {
      id: "totp",
      header: "2FA",
      cell: r =>
        r.totpEnabled ? (
          <Badge variant="success">{t("common.on")}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { id: "sessions", header: t("users.col.sessions"), className: "tabular", cell: r => r._count.sessions },
    {
      id: "isActive",
      header: t("users.col.status"),
      sortable: true,
      cell: r =>
        r.isActive ? <Badge variant="success">{t("users.active")}</Badge> : <Badge variant="muted">{t("res.off")}</Badge>,
    },
    {
      id: "createdAt",
      header: t("users.col.created"),
      sortable: true,
      className: "tabular",
      cell: r => fmtDate(r.createdAt),
    },
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("nav.users")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("auth.noSignup")}
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <DataTable<UserRow>
            columns={columns}
            fetcher={fetcher}
            rowKey={r => r.id}
            defaultSort={{ sort: "createdAt", order: "desc" }}
            searchPlaceholder={t("users.searchPlaceholder")}
            reloadKey={reloadKey}
            filters={[{ id: "role", label: t("users.col.role"), options: ROLES.map(r => ({ value: r, label: r })) }]}
            toolbar={
              can("users.manage") ? (
                <Button onClick={() => setModal({ open: true })}>
                  <Plus />
                  {t("common.create")}
                </Button>
              ) : undefined
            }
            actions={[
              {
                label: t("common.edit"),
                permission: "users.manage",
                onClick: row => setModal({ open: true, row }),
              },
              {
                label: t("users.resetPassword"),
                permission: "users.manage",
                onClick: async row => {
                  if (!confirm(t("users.confirm.reset", { email: row.email }))) return;
                  try {
                    const d = await apiJson(`/api/users/${row.id}/reset-password`, "POST");
                    // prompt, а не toast: пароль показывается один раз, и его
                    // нужно успеть скопировать — всплывашка исчезнет сама.
                    prompt(t("users.tempPassword"), d.tempPassword);
                  } catch (e: any) {
                    toast.error(e.message);
                  }
                },
              },
              {
                label: t("common.delete"),
                permission: "users.manage",
                variant: "destructive",
                hidden: row => row.id === me.id,
                onClick: async (row, rl) => {
                  if (!confirm(t("users.confirm.delete", { email: row.email }))) return;
                  try {
                    await apiJson(`/api/users/${row.id}`, "DELETE");
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

      <Dialog open={modal.open} onOpenChange={v => !v && setModal({ open: false })}>
        <DialogContent>
          <form onSubmit={save} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>
                {modal.row
                  ? t("users.form.editTitle", { email: modal.row.email })
                  : t("users.form.newTitle")}
              </DialogTitle>
            </DialogHeader>

            {!modal.row && (
              <div>
                <Label htmlFor="uf-email">Email</Label>
                <Input
                  id="uf-email"
                  className="mt-1.5"
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
            )}

            <div>
              <Label htmlFor="uf-name">{t("users.form.name")}</Label>
              <Input
                id="uf-name"
                className="mt-1.5"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <Label>{t("users.col.role")}</Label>
              <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!modal.row && (
              <div>
                <Label htmlFor="uf-pass">{t("auth.password")}</Label>
                <Input
                  id="uf-pass"
                  className="mt-1.5"
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("users.form.passwordHint")}</p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                id="uf-active"
                checked={form.isActive}
                onCheckedChange={v => setForm({ ...form, isActive: v })}
              />
              <Label htmlFor="uf-active" className="font-normal">
                {t("users.active")}
              </Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModal({ open: false })}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
