"use client";

// Вход. Двухшаговый: пароль → при включённой 2FA сервер отвечает
// {needTotp:true}, и появляется поле кода. Редукса здесь нет — форма мелкая,
// и прямой fetch честнее трёх файлов слайса ради одного запроса.

import React, { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Turnstile, type TurnstileHandle } from "@/components/captcha/turnstile";
import { useI18n } from "@/components/i18n-provider";
import { LOCALES, LOCALE_LABEL } from "@/lib/i18n/config";

export default function LoginPage() {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);

  // Токен Turnstile одноразовый: и после ошибки, и после перехода к шагу с
  // кодом его надо получить заново, иначе следующий запрос отобьётся капчей.
  const resetCaptcha = () => {
    turnstileRef.current?.reset();
    setTurnstileToken("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Turnstile-Token": turnstileToken },
        body: JSON.stringify({ email, password, totp }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.needTotp) {
        setNeedTotp(true);
        resetCaptcha();
        return;
      }
      if (!res.ok) {
        setError(data.error || t("auth.err.failed"));
        resetCaptcha();
        return;
      }
      // router.refresh() обязателен: серверные компоненты закешированы под
      // прежнюю (анонимную) сессию, и без сброса дашборд отрисуется пустым.
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError(t("auth.err.network"));
      resetCaptcha();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Image src="/images/logo-sm.png" alt="" width={48} height={48} className="rounded-xl" priority />
          <div className="text-center">
            <h1 className="text-lg font-semibold tracking-tight">
              Tuck<span className="text-primary">Tuck</span>
            </h1>
            <p className="text-sm text-muted-foreground">{t("app.tagline")}</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-5">
            <form onSubmit={submit} className="flex flex-col gap-4">
              {error && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </div>
              )}

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  className="mt-1.5"
                  autoComplete="username"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={needTotp}
                  required
                  autoFocus
                />
              </div>

              <div>
                <Label htmlFor="password">{t("auth.password")}</Label>
                <div className="relative mt-1.5">
                  <Input
                    id="password"
                    type={showPass ? "text" : "password"}
                    className="pr-9"
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={needTotp}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPass ? t("auth.hidePassword") : t("auth.showPassword")}
                  >
                    {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {needTotp && (
                <div>
                  <Label htmlFor="totp">{t("auth.totpCode")}</Label>
                  <Input
                    id="totp"
                    className="mt-1.5 tabular tracking-[0.3em]"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    value={totp}
                    onChange={e => setTotp(e.target.value.replace(/\D/g, ""))}
                    required
                    autoFocus
                  />
                </div>
              )}

              <Turnstile ref={turnstileRef} onToken={setTurnstileToken} />

              <Button type="submit" disabled={busy} className="w-full">
                {busy && <Loader2 className="animate-spin" />}
                {needTotp ? t("auth.confirm") : t("auth.signIn")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t("auth.noSignup")}
        </p>

        {/* Переключатель языка на экране входа: до входа кука ещё не поставлена,
            и человек, которому панель отдала русский по заголовку браузера,
            должен иметь возможность переключиться, не заходя внутрь. */}
        <div className="mt-3 flex justify-center gap-2">
          {LOCALES.map(l => (
            <button
              key={l}
              type="button"
              onClick={() => setLocale(l)}
              className={
                l === locale
                  ? "text-xs font-medium text-foreground"
                  : "text-xs text-muted-foreground hover:text-foreground"
              }
            >
              {LOCALE_LABEL[l]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
