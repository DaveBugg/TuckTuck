"use client";

// Оболочка панели: сайдбар, шапка, область контента.
//
// Своя, а не готовый «админ-шаблон»: нужного здесь — несколько пунктов меню и
// профиль в углу, и тащить ради этого чужой layout со своими соглашениями
// значит снова зависеть от чужих решений.

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Layers, Bell, ShieldUser, Settings2, Menu, X, Sun, Moon, LogOut, UserCog, Languages, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser, usePermissions } from "@/lib/use-permissions";
import { useI18n } from "@/components/i18n-provider";
import { LOCALES, LOCALE_LABEL } from "@/lib/i18n/config";
import { apiJson } from "@/lib/client-api";
import { NAV_ITEMS } from "./nav-items";

const ICONS = {
  dashboard: LayoutDashboard,
  resources: Layers,
  notifications: Bell,
  users: ShieldUser,
  settings: Settings2,
} as const;

function ThemeToggle() {
  const { t } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();
  // До монтирования тема неизвестна (её ставит клиентский скрипт), и отрисовка
  // «солнца» на сервере с «луной» на клиенте даёт расхождение гидрации.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("shell.toggleTheme")}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {mounted && resolvedTheme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

/**
 * Переключатель языка.
 *
 * Меняет и куку (мгновенно, для всего рендера), и поле пользователя — но
 * только куку ждём: выбор должен сработать даже у того, кто ещё не вошёл, и
 * даже если запись в профиль не прошла.
 */
function LocaleToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("shell.language")}>
          <Languages />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {LOCALES.map(l => (
          <DropdownMenuItem
            key={l}
            onClick={() => {
              void apiJson("/api/auth/me", "PATCH", { locale: l }).catch(() => null);
              setLocale(l);
            }}
          >
            {l === locale ? <Check /> : <span className="size-4" />}
            {LOCALE_LABEL[l]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const me = useCurrentUser();
  const { t } = useI18n();
  const router = useRouter();
  const initials = (me.name || me.email || "?").slice(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {initials}
          </span>
          <span className="hidden text-sm sm:inline">{me.name || me.email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{me.name || "—"}</div>
          <div className="text-xs text-muted-foreground">{me.email}</div>
          <div className="mt-1 text-xs text-muted-foreground">{t("shell.role", { role: me.role || "—" })}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/profile")}>
          <UserCog />
          {t("shell.profile")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => router.push("/auth/logout")}>
          <LogOut />
          {t("shell.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = usePermissions();
  const { t } = useI18n();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.filter(i => !i.permission || can(i.permission)).map(item => {
        const Icon = ICONS[item.icon];
        // Точное совпадение или вложенный путь — но не «/resources» для
        // «/resources-archive»: проверяем границу сегмента.
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary/15 text-sidebar-primary"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex h-14 items-center gap-2 px-4">
      <Image src="/images/logo-sm.png" alt="" width={28} height={28} className="rounded-md" priority />
      <span className="text-base font-semibold tracking-tight">
        Tuck<span className="text-primary">Tuck</span>
      </span>
    </Link>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useI18n();

  return (
    <div className="min-h-screen">
      {/* Десктопный сайдбар: фиксированный, контент отодвинут отступом. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-sidebar lg:block">
        <Brand />
        <NavLinks />
      </aside>

      {/* Мобильный сайдбар — выезжает поверх, с затемнением. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r bg-sidebar">
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label={t("shell.closeMenu")}>
                <X />
              </Button>
            </div>
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={t("shell.openMenu")}
          >
            <Menu />
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <LocaleToggle />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
