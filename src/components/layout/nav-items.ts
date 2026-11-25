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
  icon:
    | "dashboard"
    | "resources"
    | "notifications"
    | "users"
    | "settings"
    | "finance"
    | "system";
  permission?: Permission;
  /** Вложенные пункты группы (рендерятся в сайдбаре под родителем). */
  children?: Omit<NavItem, "icon" | "children">[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: "dashboard" },
  {
    href: "/resources",
    labelKey: "nav.resources",
    icon: "resources",
    permission: "resources.view",
  },
  {
    href: "/finance",
    labelKey: "nav.finance",
    icon: "finance",
    permission: "finance.view",
    children: [
      { href: "/finance", labelKey: "nav.financeBoard" },
      { href: "/finance/projects", labelKey: "nav.financeProjects" },
      { href: "/finance/expenses", labelKey: "nav.financeExpenses" },
      { href: "/finance/income", labelKey: "nav.financeIncome" },
      { href: "/finance/team", labelKey: "nav.financeTeam" },
      { href: "/finance/audit", labelKey: "nav.financeAudit" },
    ],
  },
  {
    // Группа без своей страницы: заголовок-разделитель, активность подсвечивают
    // дети по точному совпадению пути.
    href: "/system",
    labelKey: "nav.system",
    icon: "system",
    children: [
      {
        href: "/notifications",
        labelKey: "nav.notifications",
        permission: "notify.manage",
      },
      {
        href: "/users",
        labelKey: "nav.users",
        permission: "users.view",
      },
      {
        href: "/settings",
        labelKey: "nav.settings",
        permission: "users.manage",
      },
    ],
  },
];
