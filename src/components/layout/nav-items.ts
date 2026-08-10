import type { Permission } from "@/lib/permissions";

/**
 * Пункты меню. Один список на сайдбар и на мобильное меню — раньше в шаблоне
 * они жили в разных файлах и разъезжались при каждой правке.
 *
 * `permission` фильтрует пункт на клиенте ради опрятности меню; настоящий
 * гейт — middleware и requirePermission в API.
 */
export type NavItem = {
  href: string;
  /** Ключ словаря, а не готовая надпись: список общий для всех языков. */
  labelKey: string;
  /** Имя иконки из lucide-react (см. icon-map в sidebar). */
  icon: "dashboard" | "resources" | "notifications" | "users" | "settings";
  permission?: Permission;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: "dashboard" },
  { href: "/resources", labelKey: "nav.resources", icon: "resources", permission: "resources.view" },
  { href: "/notifications", labelKey: "nav.notifications", icon: "notifications", permission: "notify.manage" },
  { href: "/users", labelKey: "nav.users", icon: "users", permission: "users.view" },
  { href: "/settings", labelKey: "nav.settings", icon: "settings", permission: "users.manage" },
];
