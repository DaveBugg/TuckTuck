"use client";

// Установка агента по SSH прямо из панели: адрес, пользователь, ключ — и лог
// установки в реальном времени.
//
// Ключ живёт только в состоянии этой формы и в теле одного запроса. Он не
// уходит ни в localStorage, ни в БД, и поле очищается сразу после успешной
// установки: держать чужой приватный ключ в открытой вкладке дольше, чем нужно,
// незачем.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, Upload, ShieldCheck, Terminal, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n-provider";
import type { ResourceRow } from "./types";

type Line = { text: string; stream: "out" | "err" | "sys" };
type State = "idle" | "running" | "ok" | "fail";

/** Ключ бывает 4 КБ, файл «не тот» — 4 МБ. Читаем только правдоподобное. */
const MAX_KEY_BYTES = 64 * 1024;

export default function SshInstall({
  row,
  onInstalled,
}: {
  row: ResourceRow;
  onInstalled: () => void;
}) {
  const { t } = useI18n();
  const [host, setHost] = useState(row.sshHost || row.ip || "");
  const [port, setPort] = useState(String(row.sshPort || 22));
  const [user, setUser] = useState(row.sshUser || "root");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [useSudo, setUseSudo] = useState(false);
  const [resetFp, setResetFp] = useState(false);

  const [state, setState] = useState<State>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Под root sudo не нужен и мешает: на многих серверах его там просто нет.
  useEffect(() => {
    setUseSudo(user.trim() !== "root" && user.trim() !== "");
  }, [user]);

  // Лог сам едет вниз, пока идёт установка. После завершения не трогаем: человек
  // как раз отматывает наверх искать, на чём всё сломалось.
  useEffect(() => {
    if (state === "running" && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines, state]);

  const pickFile = useCallback(
    async (f: File) => {
      if (f.size > MAX_KEY_BYTES) {
        toast.error(t("ssh.form.fileTooBig"));
        return;
      }
      const text = await f.text();
      if (/^-----BEGIN .*PUBLIC KEY-----/m.test(text) || /^ssh-(rsa|ed25519|dss) /.test(text.trim())) {
        // Самая частая ошибка: подсовывают .pub. Ошибка ssh2 в этом случае
        // невнятная, а причина простая и называется одним словом.
        toast.error(t("ssh.form.publicKey"));
        return;
      }
      setPrivateKey(text);
    },
    [t]
  );

  const run = useCallback(async () => {
    setState("running");
    setLines([]);

    let res: Response;
    try {
      res = await fetch(`/api/resources/${row.id}/agent/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: host.trim(),
          port: Number(port) || 22,
          user: user.trim(),
          privateKey,
          passphrase,
          useSudo,
          resetFingerprint: resetFp,
        }),
      });
    } catch {
      setLines([{ text: t("ssh.form.requestFailed"), stream: "err" }]);
      setState("fail");
      return;
    }

    if (!res.ok || !res.body) {
      const d = await res.json().catch(() => ({}));
      setLines([{ text: d?.error || t("err.http", { status: res.status }), stream: "err" }]);
      setState("fail");
      return;
    }

    // NDJSON: разбираем по строкам, храня незаконченный хвост между чанками —
    // граница чанка приходится на середину строки регулярно.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let done = false;

    const handle = (obj: any) => {
      if (obj.type === "log") setLines(p => [...p, { text: obj.text, stream: obj.stream }]);
      else if (obj.type === "status") setLines(p => [...p, { text: obj.text, stream: "sys" }]);
      else if (obj.type === "done") {
        setLines(p => [...p, { text: obj.text, stream: obj.ok ? "sys" : "err" }]);
        setState(obj.ok ? "ok" : "fail");
        done = true;
        if (obj.ok) {
          setPrivateKey("");
          setPassphrase("");
          onInstalled();
        }
      }
    };

    for (;;) {
      const { value, done: fin } = await reader.read();
      if (fin) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const p of parts) {
        if (!p.trim()) continue;
        try {
          handle(JSON.parse(p));
        } catch {
          // Не наша строка (например, страница ошибки от прокси) — показываем
          // как есть, это полезнее, чем проглотить.
          setLines(prev => [...prev, { text: p, stream: "err" }]);
        }
      }
    }

    // Поток кончился, а «done» не пришёл: соединение оборвали на середине.
    if (!done) {
      setLines(p => [...p, { text: t("ssh.form.streamBroken"), stream: "err" }]);
      setState("fail");
    }
  }, [row.id, host, port, user, privateKey, passphrase, useSudo, resetFp, onInstalled, t]);

  const busy = state === "running";
  const canRun = !!host.trim() && !!user.trim() && !!privateKey.trim() && !busy;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_10rem]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ssh-host">{t("ssh.form.host")}</Label>
          <Input
            id="ssh-host"
            value={host}
            onChange={e => setHost(e.target.value)}
            placeholder={t("ssh.form.hostPlaceholder")}
            disabled={busy}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ssh-port">{t("res.form.port")}</Label>
          <Input
            id="ssh-port"
            value={port}
            onChange={e => setPort(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            disabled={busy}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ssh-user">{t("ssh.form.user")}</Label>
          <Input id="ssh-user" value={user} onChange={e => setUser(e.target.value)} disabled={busy} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="ssh-key">{t("ssh.form.key")}</Label>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void pickFile(f);
                // Сбрасываем, иначе повторный выбор того же файла не вызовет change.
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Upload />
              {t("ssh.form.uploadFile")}
            </Button>
          </div>
        </div>
        <Textarea
          id="ssh-key"
          value={privateKey}
          onChange={e => setPrivateKey(e.target.value)}
          placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n…\n-----END OPENSSH PRIVATE KEY-----"}
          spellCheck={false}
          autoComplete="off"
          className="h-32 font-mono text-xs"
          disabled={busy}
        />
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          {t("ssh.form.keyHint")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ssh-pass">{t("ssh.form.passphrase")}</Label>
          <Input
            id="ssh-pass"
            type="password"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            placeholder={t("ssh.form.passphraseHint")}
            autoComplete="off"
            disabled={busy}
          />
        </div>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={useSudo} onCheckedChange={setUseSudo} disabled={busy} />
            {t("ssh.form.sudo")}
          </label>
          {!!row.sshFingerprint && (
            <label
              className="flex items-center gap-2 text-sm"
              title={t("ssh.form.knownFingerprint", { fp: row.sshFingerprint })}
            >
              <Switch checked={resetFp} onCheckedChange={setResetFp} disabled={busy} />
              {t("ssh.form.resetFingerprint")}
            </label>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={run} disabled={!canRun}>
          {busy ? <Loader2 className="animate-spin" /> : <Play />}
          {busy ? t("ssh.form.installing") : t("ssh.form.install")}
        </Button>
        {state === "ok" && (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="size-3.5" />
            {t("common.done")}
          </Badge>
        )}
        {state === "fail" && (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="size-3.5" />
            {t("ssh.form.failed")}
          </Badge>
        )}
        {busy && <span className="text-sm text-muted-foreground">{t("ssh.form.takesTime")}</span>}
      </div>

      {lines.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
            <Terminal className="size-4 text-muted-foreground" />
            {t("ssh.form.log")}
          </div>
          <div
            ref={logRef}
            className="max-h-64 overflow-y-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed"
          >
            {lines.map((l, i) => (
              <div
                key={i}
                className={
                  l.stream === "err"
                    ? "whitespace-pre-wrap break-all text-destructive"
                    : l.stream === "sys"
                      ? "whitespace-pre-wrap break-all text-info"
                      : "whitespace-pre-wrap break-all"
                }
              >
                {l.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
