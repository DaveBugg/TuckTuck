"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiJson } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import type { MemberRow } from "../types";

export default function MemberForm({
  open,
  row,
  onClose,
  onSaved,
}: {
  open: boolean;
  row?: MemberRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? "");
    setPosition(row?.position ?? "");
  }, [open, row]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (row) {
        await apiJson(`/api/finance/members/${row.id}`, "PATCH", {
          name: name.trim(),
          position: position.trim(),
        });
      } else {
        await apiJson("/api/finance/members", "POST", {
          name: name.trim(),
          position: position.trim(),
        });
      }
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
            <DialogTitle>
              {row
                ? t("finance.team.form.editTitle")
                : t("finance.team.form.newTitle")}
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="mf-name">{t("finance.team.form.name")}</Label>
            <Input
              id="mf-name"
              className="mt-1.5"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="mf-position">
              {t("finance.team.form.position")}
            </Label>
            <Input
              id="mf-position"
              className="mt-1.5"
              value={position}
              onChange={e => setPosition(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
