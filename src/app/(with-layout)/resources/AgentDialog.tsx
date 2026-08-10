"use client";

// Подключение агента мониторинга к ресурсу.
//
// Токен показывается ОДИН раз — сразу после выпуска, вместе с готовой командой
// установки. Хранить его в списках и отдавать в каждом ответе API незачем: он
// даёт право писать метрики, а перевыпустить его — одно нажатие.

import React, { useEffect, useState } from "react";
import { Copy, KeyRound, Power, Check, Plug, TerminalSquare } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { apiFetch, apiJson } from "@/lib/client-api";
import { SystemSummary, type SystemView } from "@/components/monitoring/metrics";
import MetricsHistory from "@/components/monitoring/history";
import { AGENT_INTERVAL_SEC } from "@/lib/monitoring";
import SshInstall from "./SshInstall";
import { useI18n } from "@/components/i18n-provider";
import type { ResourceRow } from "./types";

function CopyBlock({
  text,
  copyLabel,
  copyErr,
}: {
  text: string;
  copyLabel: string;
  copyErr: string;
}) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      // Буфер недоступен без https или без разрешения — текст всё равно виден
      // и выделяется мышью, поэтому это не ошибка, а просто отсутствие удобства.
      toast.error(copyErr);
    }
  };
  return (
    <div className="relative">
      {/* Переносим длинные строки, а не прокручиваем вбок: команду читают
          глазами и копируют кнопкой, а горизонтальная прокрутка прячет то,
          что человек как раз проверяет — адрес панели и токен.
          break-all, потому что рвать нужно посреди токена и URL, где нет
          пробелов, — иначе перенос не сработает вовсе. */}
      <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-all rounded-md border bg-muted/50 p-3 pr-10 font-mono text-xs leading-relaxed">
        {text}
      </pre>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute right-1.5 top-1.5"
        onClick={copy}
        aria-label={copyLabel}
      >
        {done ? <Check className="text-success" /> : <Copy />}
      </Button>
    </div>
  );
}

export default function AgentDialog({
  open,
  row,
  onClose,
  onChanged,
}: {
  open: boolean;
  row?: ResourceRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [system, setSystem] = useState<SystemView | null>(null);
  // По SSH — первым, но только когда есть что устанавливать. Если агент уже
  // стоит и ставили его руками (следов ssh нет), открывать форму с ключами
  // незачем: человек пришёл посмотреть метрики, а перед ним анкета.
  const [mode, setMode] = useState<"ssh" | "manual">("ssh");

  useEffect(() => {
    if (!open || !row) return;
    setToken(null);
    setSystem(null);
    setMode(row.agentConnected && !row.sshFingerprint && !row.sshHost ? "manual" : "ssh");
    // Метрики грузим при открытии: в попапе они главное, ради чего сюда зашли.
    apiFetch(`/api/monitoring/${row.id}`)
      .then(d => setSystem(d.system))
      .catch(() => setSystem(null));
  }, [open, row]);

  if (!row) return null;

  const issue = async () => {
    if (row.agentConnected && !confirm(t("agent.confirm.reissue"))) {
      return;
    }
    setBusy(true);
    try {
      const d = await apiJson(`/api/resources/${row.id}/agent`, "POST");
      setToken(d.token);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!confirm(t("agent.confirm.disable"))) return;
    setBusy(true);
    try {
      await apiJson(`/api/resources/${row.id}/agent`, "DELETE");
      setToken(null);
      toast.success(t("agent.disabled"));
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const base = typeof window !== "undefined" ? window.location.origin : "";
  // Одна строка через install.sh, а не пять отдельных команд.
  //
  // Пять команд тут когда-то и стояли — и последняя из них дописывала запись в
  // crontab. Человек выполнил их дважды, записей стало две, метрики пошли
  // парами. install.sh идемпотентен: он снимает прежнее расписание перед тем,
  // как поставить своё.
  const install = token
    ? `curl -fsSL ${base}/install.sh | TUCKTUCK_URL='${base}' TUCKTUCK_TOKEN='${token}' sh`
    : "";

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("agent.title", { name: row.name })}
            {row.isSelf ? (
              <Badge variant="secondary">{t("agent.selfBadge")}</Badge>
            ) : row.agentConnected ? (
              <Badge variant="success">{t("agent.connected")}</Badge>
            ) : (
              <Badge variant="muted">{t("agent.notConnected")}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {t("agent.desc", { sec: AGENT_INTERVAL_SEC })}
          </DialogDescription>
        </DialogHeader>

        {/* Текущее состояние — первым: человек чаще заходит посмотреть, как
            дела у машины, чем перевыпустить токен. */}
        {system && (system.agentConnected || row.isSelf) && (
          <div className="flex flex-col gap-4">
            <div className="rounded-md border p-3">
              <SystemSummary s={system} />
            </div>
            <div className="rounded-md border p-3">
              <MetricsHistory resourceId={row.id} />
            </div>
          </div>
        )}

        {/* Серверу панели ставить нечего: метрики снимаются изнутри
            контейнера. Показывать ему форму с ssh-ключами — предлагать работу,
            которой нет. */}
        {row.isSelf && (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            {t("agent.selfNote")}
          </p>
        )}

        {!token && !row.isSelf && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={mode === "ssh" ? "default" : "outline"}
                onClick={() => setMode("ssh")}
              >
                <Plug />
                {t("agent.viaSsh")}
              </Button>
              <Button
                size="sm"
                variant={mode === "manual" ? "default" : "outline"}
                onClick={() => setMode("manual")}
              >
                <TerminalSquare />
                {t("agent.manual")}
              </Button>
              {row.agentConnected && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={disable}
                  disabled={busy}
                >
                  <Power />
                  {t("agent.disable")}
                </Button>
              )}
            </div>

            {mode === "ssh" ? (
              <SshInstall
                row={row}
                onInstalled={() => {
                  toast.success(t("agent.installed"));
                  onChanged();
                }}
              />
            ) : (
              <div className="flex flex-col gap-3 text-sm">
                <p className="text-muted-foreground">
                  {row.agentConnected ? t("agent.hasToken") : t("agent.needToken")}
                </p>
                <div>
                  <Button onClick={issue} disabled={busy}>
                    <KeyRound />
                    {row.agentConnected ? t("agent.reissue") : t("agent.issue")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {token && (
          <div className="flex flex-col gap-3">
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              {t("agent.tokenOnce")}
            </div>
            <div>
              <div className="mb-1.5 text-sm font-medium">{t("agent.runAsRoot")}</div>
              <CopyBlock
                text={install}
                copyLabel={t("common.copy")}
                copyErr={t("agent.clipboardError")}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("agent.repeatHint")}{" "}
              <code className="font-mono">wget -qO- {base}/install.sh |</code>.{" "}
              {t("agent.firstMetrics")}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {token ? t("common.done") : t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
