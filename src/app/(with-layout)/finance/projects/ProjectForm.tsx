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
import { Textarea } from "@/components/ui/textarea";
import { apiJson } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import type { ProjectRow } from "../types";

export default function ProjectForm({
  open,
  row,
  onClose,
  onSaved,
}: {
  open: boolean;
  row?: ProjectRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? "");
    setDescription(row?.description ?? "");
  }, [open, row]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (row) {
        await apiJson(`/api/finance/projects/${row.id}`, "PATCH", {
          name: name.trim(),
          description: description.trim(),
        });
      } else {
        await apiJson("/api/finance/projects", "POST", {
          name: name.trim(),
          description: description.trim(),
        });
      }
      toast.success(t(row ? "common.saved" : "common.saved"));
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
                ? t("finance.projects.form.editTitle")
                : t("finance.projects.form.newTitle")}
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="pf-name">{t("finance.projects.form.name")}</Label>
            <Input
              id="pf-name"
              className="mt-1.5"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="pf-desc">
              {t("finance.projects.form.description")}
            </Label>
            <Textarea
              id="pf-desc"
              className="mt-1.5"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
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
