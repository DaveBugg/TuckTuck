import type { Metadata } from "next";
import React from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/components/i18n-provider";
import { Toaster } from "@/components/ui/sonner";
import { getLocale } from "@/lib/i18n/server";
import { makeT } from "@/lib/i18n/translate";
import "./globals.css";

// Описание — на языке пользователя, заголовок один для всех: это имя продукта.
export async function generateMetadata(): Promise<Metadata> {
  const t = makeT(await getLocale());
  return {
    title: "TuckTuck",
    description: t("app.description"),
    // Панель закрыта от индексации целиком.
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    // suppressHydrationWarning обязателен: next-themes проставляет класс темы
    // на <html> до гидрации, и без него React ругается на расхождение разметки.
    <html lang={locale} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          {/* Язык приходит с сервера тем же значением, что и в lang выше:
              определять его на клиенте значило бы отрисовать первый кадр на
              одном языке, а после гидрации переключиться на другой. */}
          <I18nProvider locale={locale}>
            {children}
            <Toaster />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
