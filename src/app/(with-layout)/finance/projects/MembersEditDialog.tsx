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
import { Switch } from "@/components/ui/switch";
import { apiFetch, apiJson } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import type { ProjectRow, ProjectDetail } from "../types";

type MemberOption = {
  id: string;
  name: string;
  checked: boolean;
  percent: string;
};

export default function MembersEditDialog({
  open,
  project,
  onClose,
  onSaved,
}: {
  open: boolean;
  project: ProjectRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      apiFetch("/api/finance/members?active=true&pageSize=1000") as Promise<{
        rows: Array<{ id: string; name: string }>;
      }>,
      apiFetch(`/api/finance/projects/${project.id}`) as Promise<{
        row: ProjectDetail;
      }>,
    ])
      .then(([all, detail]) => {
        const current = new Map(
          detail.row.members.map(m => [m.memberId, m.percent])
        );
        setMembers(
          all.rows.map(m => ({
            id: m.id,
            name: m.name,
            checked: current.has(m.id),
            percent: current.get(m.id) ?? "",
          }))
        );
      })
      .catch(e => toast.error(e.message));
  }, [open, project.id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = members
      .filter(m => m.checked)
      .map(m => ({
        memberId: m.id,
        percent:
          m.percent.trim() === ""
            ? null
            : Math.min(100, Math.max(0, Number(m.percent))),
      }));
    setBusy(true);
    try {
      await apiJson(`/api/finance/projects/${project.id}/members`, "PUT", {
        members: payload,
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
            <DialogTitle>
              {t("finance.projects.action.addMember")}: {project.name}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3">
                <Switch
                  checked={m.checked}
                  onCheckedChange={v =>
                    setMembers(prev =>
                      prev.map(x => (x.id === m.id ? { ...x, checked: v } : x))
                    )
                  }
                />
                <span className="flex-1 text-sm">{m.name}</span>
                <div className="w-24">
                  <Label className="sr-only">%</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={m.percent}
                    disabled={!m.checked}
                    onChange={e =>
                      setMembers(prev =>
                        prev.map(x =>
                          x.id === m.id ? { ...x, percent: e.target.value } : x
                        )
                      )
                    }
                    placeholder="%"
                  />
                </div>
              </div>
            ))}
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
