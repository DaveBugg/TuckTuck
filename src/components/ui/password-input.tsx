"use client";

// Поле пароля с переключателем видимости. Единый паттерн для всей панели
// (логин, пользователи, профиль, токены ботов, ключи) — до этого «глаз» был
// только на странице входа, а в остальных формах пароль вводился вслепую.

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./input";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

export function PasswordInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  const { t } = useI18n();
  const [show, setShow] = React.useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={show ? "text" : "password"}
        className={cn("pr-9", className)}
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
