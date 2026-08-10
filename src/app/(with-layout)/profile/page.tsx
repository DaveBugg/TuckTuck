"use client";

// Профиль и безопасность: смена пароля, двухфакторка, активные сессии.

import React, { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, LogOut, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { apiJson } from "@/lib/client-api";
import { useCurrentUser } from "@/lib/use-permissions";
import { useI18n } from "@/components/i18n-provider";
import { LOCALES, LOCALE_LABEL } from "@/lib/i18n/config";

type SessionRow = {
  id: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
};

export default function ProfilePage() {
  const me = useCurrentUser();
  const { t, locale, setLocale, fmtDateTime } = useI18n();

  // ── смена пароля ──
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== again) {
      toast.error(t("profile.err.mismatch"));
      return;
    }
    setPwBusy(true);
    try {
      await apiJson("/api/auth/change-password", "POST", {
        oldPassword: cur,
        newPassword: next,
      });
      setCur("");
      setNext("");
      setAgain("");
      toast.success(t("profile.passwordChanged"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPwBusy(false);
    }
  };

  // ── 2FA ──
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);

  const loadMe = useCallback(() => {
    apiJson("/api/auth/me", "GET")
      .then(d => setTotpEnabled(!!d.totpEnabled))
      .catch(() => setTotpEnabled(false));
  }, []);
  useEffect(loadMe, [loadMe]);

  const startSetup = async () => {
    setTotpBusy(true);
    try {
      const d = await apiJson("/api/auth/2fa/setup", "POST");
      setSetup({ secret: d.secret, otpauthUrl: d.otpauthUrl });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTotpBusy(false);
    }
  };

  const confirmSetup = async () => {
    setTotpBusy(true);
    try {
      await apiJson("/api/auth/2fa/verify", "POST", { code });
      setSetup(null);
      setCode("");
      loadMe();
      toast.success(t("profile.totpOn"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTotpBusy(false);
    }
  };

  const disable2fa = async () => {
    if (!confirm(t("profile.confirm.totpOff"))) return;
    setTotpBusy(true);
    try {
      await apiJson("/api/auth/2fa/disable", "POST", { code });
      setCode("");
      loadMe();
      toast.success(t("profile.totpOff"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTotpBusy(false);
    }
  };

  // ── сессии ──
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const loadSessions = useCallback(() => {
    apiJson("/api/auth/sessions", "GET")
      .then(d => setSessions(d.sessions))
      .catch(() => setSessions([]));
  }, []);
  useEffect(loadSessions, [loadSessions]);

  const revoke = async (sessionId?: string) => {
    if (!confirm(t(sessionId ? "profile.confirm.revokeOne" : "profile.confirm.revokeAll"))) return;
    try {
      await apiJson("/api/auth/sessions", "DELETE", sessionId ? { sessionId } : { others: true });
      loadSessions();
      toast.success(t("common.done"));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("shell.profile")}</h1>
        <p className="text-sm text-muted-foreground">
          {me.email} · {t("shell.role", { role: me.role || "—" })}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("profile.language")}</CardTitle>
          <CardDescription>{t("profile.languageDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {LOCALES.map(l => (
            <Button
              key={l}
              size="sm"
              variant={l === locale ? "default" : "outline"}
              onClick={() => {
                // Кука меняется сразу, запись в профиль идёт фоном: выбор
                // должен сработать, даже если запрос не прошёл.
                void apiJson("/api/auth/me", "PATCH", { locale: l }).catch(() => null);
                setLocale(l);
              }}
            >
              {LOCALE_LABEL[l]}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("profile.changePassword")}</CardTitle>
          <CardDescription>
            {t("profile.changePasswordHint")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="flex max-w-md flex-col gap-3">
            <div>
              <Label htmlFor="cur">{t("profile.currentPassword")}</Label>
              <Input
                id="cur"
                type="password"
                className="mt-1.5"
                autoComplete="current-password"
                value={cur}
                onChange={e => setCur(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="new">{t("profile.newPassword")}</Label>
              <Input
                id="new"
                type="password"
                className="mt-1.5"
                autoComplete="new-password"
                minLength={8}
                value={next}
                onChange={e => setNext(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">{t("users.form.passwordHint")}</p>
            </div>
            <div>
              <Label htmlFor="again">{t("profile.repeatPassword")}</Label>
              <Input
                id="again"
                type="password"
                className="mt-1.5"
                autoComplete="new-password"
                value={again}
                onChange={e => setAgain(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={pwBusy} className="self-start">
              {pwBusy && <Loader2 className="animate-spin" />}
              {t("profile.changePassword")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t("profile.totp")}
            {totpEnabled === true && <Badge variant="success">{t("profile.totpEnabled")}</Badge>}
            {totpEnabled === false && <Badge variant="muted">{t("profile.totpDisabled")}</Badge>}
          </CardTitle>
          <CardDescription>
            {t("profile.totpDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {totpEnabled === null && <Skeleton className="h-9 w-40" />}

          {totpEnabled === false && !setup && (
            <Button variant="outline" onClick={startSetup} disabled={totpBusy} className="self-start">
              {totpBusy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              {t("common.enable")}
            </Button>
          )}

          {setup && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {t("profile.totpSetup")}
              </p>
              {/* QR рисуется локально (qrcode.react), а не внешним сервисом:
                  иначе секрет уходил бы третьей стороне в параметрах URL. */}
              <div className="w-fit rounded-md bg-white p-3">
                <QRCodeSVG value={setup.otpauthUrl} size={180} />
              </div>
              <div className="text-xs">
                <span className="text-muted-foreground">{t("profile.totpManualKey")} </span>
                <code className="rounded bg-muted px-1.5 py-0.5">{setup.secret}</code>
              </div>
              <div className="flex items-end gap-2">
                <div>
                  <Label htmlFor="code">{t("auth.totpCode")}</Label>
                  <Input
                    id="code"
                    className="mt-1.5 w-36 tabular tracking-[0.3em]"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <Button onClick={confirmSetup} disabled={totpBusy || code.length < 6}>
                  {t("auth.confirm")}
                </Button>
                <Button variant="ghost" onClick={() => setSetup(null)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          )}

          {totpEnabled === true && (
            <div className="flex items-end gap-2">
              <div>
                <Label htmlFor="dcode">{t("profile.totpDisableCode")}</Label>
                <Input
                  id="dcode"
                  className="mt-1.5 w-36 tabular tracking-[0.3em]"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <Button variant="outline" onClick={disable2fa} disabled={totpBusy || code.length < 6}>
                <ShieldOff />
                {t("common.disable")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>{t("profile.sessions")}</CardTitle>
            <CardDescription>{t("profile.sessionsDesc")}</CardDescription>
          </div>
          {sessions && sessions.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => revoke()}>
              <LogOut />
              {t("profile.revokeOthers")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {sessions === null && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}
          {sessions?.length === 0 && <p className="text-sm text-muted-foreground">{t("profile.noSessions")}</p>}
          {sessions && sessions.length > 0 && (
            <ul className="flex flex-col">
              {sessions.map((s, i) => (
                <li key={s.id}>
                  {i > 0 && <Separator />}
                  <div className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{s.ip || "—"}</span>
                        {s.isCurrent && <Badge variant="success">{t("profile.current")}</Badge>}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {s.userAgent || t("profile.unknownDevice")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("profile.lastSeen", { at: fmtDateTime(s.lastSeenAt) })}
                      </div>
                    </div>
                    {!s.isCurrent && (
                      <Button variant="ghost" size="sm" onClick={() => revoke(s.id)}>
                        {t("profile.revoke")}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
