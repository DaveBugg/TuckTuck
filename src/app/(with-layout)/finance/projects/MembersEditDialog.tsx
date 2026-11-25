"use client";

import React, { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
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
  active: boolean;
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
      apiFetch("/api/finance/members?archived=false&pageSize=1000") as Promise<{
        rows: Array<{ id: string; name: string; active: boolean }>;
      }>,
      apiFetch(`/api/finance/projects/${project.id}`) as Promise<{
        row: ProjectDetail;
      }>,
    ])
      .then(([all, detail]) => {
        const current = new Map(detail.row.members.map(m => [m.memberId, m]));
        setMembers(
          all.rows.map(m => {
            const cur = current.get(m.id);
            return {
              id: m.id,
              name: m.name,
              checked: !!cur,
              percent: cur?.percent ?? "",
              active: cur?.active ?? true,
            };
          })
        );
      })
      .catch(e => toast.error(e.message));
  }, [open, project.id]);

  const update = (id: string, patch: Partial<MemberOption>) => {
    setMembers(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = members
      .filter(m => m.checked)
      .map(m => ({
        memberId: m.id,
        active: m.active,
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
              {t("finance.projects.action.editMembers")}: {project.name}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
            {members.map(m => (
              <div
                key={m.id}
                className="flex items-start gap-3 rounded-md border p-3"
              >
                <Switch
                  checked={m.checked}
                  onCheckedChange={v => update(m.id, { checked: v })}
                  aria-label={t("finance.projects.memberIncluded")}
                />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{m.name}</span>
                    {m.checked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => update(m.id, { checked: false })}
                        aria-label={t("common.delete")}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                  {m.checked && (
                    <div className="flex items-center gap-3">
                      <div className="w-24">
                        <Label className="sr-only">%</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={m.percent}
                          onChange={e =>
                            update(m.id, { percent: e.target.value })
                          }
                          placeholder="%"
                        />
                      </div>
                      <div className="flex flex-1 items-center gap-2">
                        <Switch
                          id={`active-${m.id}`}
                          checked={m.active}
                          onCheckedChange={v => update(m.id, { active: v })}
                        />
                        <Label
                          htmlFor={`active-${m.id}`}
                          className="text-sm font-normal"
                        >
                          {m.active
                            ? t("finance.team.status.active")
                            : t("finance.team.status.inactive")}
                        </Label>
                      </div>
                    </div>
                  )}
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
