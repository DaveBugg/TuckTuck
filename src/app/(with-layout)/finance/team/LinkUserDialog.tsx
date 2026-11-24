"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { apiFetch, apiJson } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import type { MemberRow } from "../types";

const NONE = "__none__";

type User = { id: string; email: string; name: string | null };

export default function LinkUserDialog({
  open,
  member,
  onClose,
  onSaved,
}: {
  open: boolean;
  member: MemberRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      apiFetch("/api/users?pageSize=1000") as Promise<{ rows: User[] }>,
      apiFetch("/api/finance/members?pageSize=1000") as Promise<{
        rows: MemberRow[];
      }>,
    ])
      .then(([u, m]) => {
        setUsers(u.rows);
        setMembers(m.rows);
      })
      .catch(e => toast.error(e.message));
  }, [open]);

  const options = useMemo(() => {
    const linkedIds = new Set(
      members.filter(m => m.id !== member.id && m.userId).map(m => m.userId)
    );
    return users
      .filter(u => !linkedIds.has(u.id))
      .map(u => ({
        value: u.id,
        label: u.email,
        hint: u.name || undefined,
      }));
  }, [users, members, member.id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await apiJson(`/api/finance/members/${member.id}/link-user`, "POST", {
        userId: selected,
      });
      toast.success(t("common.saved"));
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("finance.team.link.title")}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>{t("finance.team.col.account")}</Label>
            <div className="mt-1.5">
              {options.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("finance.team.link.empty")}
                </p>
              ) : (
                <SearchSelect
                  value={selected || NONE}
                  onChange={v => setSelected(v === NONE ? "" : v)}
                  options={[
                    { value: NONE, label: `— ${t("common.search")} —` },
                    ...options,
                  ]}
                  searchPlaceholder={t("common.search")}
                  emptyText={t("common.nothingFound")}
                  ariaLabel={t("finance.team.col.account")}
                />
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !selected}>
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
