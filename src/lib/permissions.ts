// Единая система прав TuckTuck. ИЗОМОРФНЫЙ модуль — никаких node/prisma
// импортов: используется в edge middleware, серверных роутах и клиентском UI
// (меню/кнопки). Роль берётся из JWT/БД, права — ЗДЕСЬ.
//
// Правило: код проверяет ПРАВО (can(user, "users.manage")), а не роль.
// Роли — только способ выдать набор прав; новые роли/права добавлять в maps.

export type Role = "ADMIN" | "USER";

export type Permission =
  | "dashboard.view"
  // пользователи системы
  | "users.view"
  | "users.manage"
  // оплачиваемые ресурсы: серверы, VPN, прокси, домены, SaaS
  | "resources.view"
  | "resources.manage"
  // справочники, которые заводятся «быстро, как тег», прямо из формы ресурса
  | "catalog.manage"
  // Раскрытие сохранённых кредов — ОТДЕЛЬНОЕ право, а не resources.manage:
  // редактировать карточку сервера и смотреть его root-пароль это разные
  // уровни доступа, и каждый показ пишется в журнал.
  | "credentials.reveal"
  // Telegram-боты: токены, чаты, фильтры рассылки
  | "notify.manage";

const ALL: Permission[] = [
  "dashboard.view",
  "users.view",
  "users.manage",
  "resources.view",
  "resources.manage",
  "catalog.manage",
  "credentials.reveal",
  "notify.manage",
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(ALL),
  // USER видит ресурсы, но только своих групп (фильтрация — в API, не здесь:
  // право отвечает на вопрос «пускать ли в раздел», а не «какие строки отдать»).
  USER: new Set<Permission>(["dashboard.view", "resources.view"]),
};

export function hasPermission(role: string | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  const set = ROLE_PERMISSIONS[role as Role];
  return set ? set.has(perm) : false;
}

/** Гейты страниц для edge middleware: первый совпавший префикс пути → право. */
export const ROUTE_PERMISSIONS: Array<{ prefix: string; permission: Permission }> = [
  { prefix: "/users", permission: "users.view" },
  { prefix: "/resources", permission: "resources.view" },
  { prefix: "/notifications", permission: "notify.manage" },
  { prefix: "/settings", permission: "users.manage" },
];

export function routePermission(pathname: string): Permission | null {
  const hit = ROUTE_PERMISSIONS.find(
    r => pathname === r.prefix || pathname.startsWith(r.prefix + "/")
  );
  return hit ? hit.permission : null;
}
