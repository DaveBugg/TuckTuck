"use client";

// Логаут: гасим сессию на сервере (он же чистит куки) и уводим на логин.
// Редирект делаем в любом случае — даже если запрос не прошёл, оставлять
// человека на пустой странице хуже, чем показать форму входа.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

export default function LogoutPage() {
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    fetch("/api/auth/logout", { method: "POST" })
      .catch(() => {})
      .finally(() => {
        router.replace("/auth/login");
        router.refresh();
      });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <span className="sr-only">{t("auth.signingOut")}</span>
    </div>
  );
}
