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
  | "notify.manage"
  // Finance Board: права на финансовый раздел (§6 spec)
  | "finance.view"
  | "finance.submit"
  | "finance.approve"
  | "finance.manage"
  | "finance.admin";

const ALL: Permission[] = [
  "dashboard.view",
  "users.view",
  "users.manage",
  "resources.view",
  "resources.manage",
  "catalog.manage",
  "credentials.reveal",
  "notify.manage",
  "finance.view",
  "finance.submit",
  "finance.approve",
  "finance.manage",
  "finance.admin",
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(ALL),
  // USER видит ресурсы, но только своих групп (фильтрация — в API, не здесь:
  // право отвечает на вопрос «пускать ли в раздел», а не «какие строки отдать»).
  // В Finance Board обычный пользователь может только подавать расходы на аппрув.
  USER: new Set<Permission>([
    "dashboard.view",
    "resources.view",
    "finance.submit",
  ]),
};

export function hasPermission(
  role: string | null | undefined,
  perm: Permission
): boolean {
  if (!role) return false;
  const set = ROLE_PERMISSIONS[role as Role];
  return set ? set.has(perm) : false;
}

/** Гейты страниц для edge middleware: первый совпавший префикс пути → право. */
export const ROUTE_PERMISSIONS: Array<{
  prefix: string;
  permission: Permission;
}> = [
  { prefix: "/users", permission: "users.view" },
  { prefix: "/resources", permission: "resources.view" },
  { prefix: "/notifications", permission: "notify.manage" },
  { prefix: "/settings", permission: "users.manage" },
  { prefix: "/finance", permission: "finance.view" },
];

/** Гейты API-роутов Finance Board по методу и пути (используются в хендлерах).
 * Префикс /api/finance/* в middleware не проверяется — API гвардятся сами. */
export const API_ROUTE_PERMISSIONS: Array<{
  method: string;
  pattern: RegExp;
  permission: Permission;
}> = [
  // аудит — manage (специфичнее общего GET, поэтому выше)
  {
    method: "GET",
    pattern: /^\/api\/finance\/audit$/,
    permission: "finance.manage",
  },
  // просмотр списков / сводки
  {
    method: "GET",
    pattern: /^\/api\/finance(\/|$)/,
    permission: "finance.view",
  },
  // создание расхода (в т.ч. из бота) — всегда submit. Строго /expenses, без
  // подпутей, чтобы approve/reject не попали под submit.
  {
    method: "POST",
    pattern: /^\/api\/finance\/expenses$/,
    permission: "finance.submit",
  },
  // создание дохода, периодики, распределения — manage
  {
    method: "POST",
    pattern: /^\/api\/finance\/(incomes|recurring|distributions)$/,
    permission: "finance.manage",
  },
  // ручной прогон периодики — manage (также воркер по заголовку)
  {
    method: "POST",
    pattern: /^\/api\/finance\/recurring\/run$/,
    permission: "finance.manage",
  },
  // правка/удаление собственного PENDING-расхода — submit; остальные операции — manage
  {
    method: "PATCH",
    pattern: /^\/api\/finance\/expenses\/[^/]+$/,
    permission: "finance.submit",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/finance\/expenses\/[^/]+$/,
    permission: "finance.submit",
  },
  {
    method: "PATCH",
    pattern:
      /^\/api\/finance\/(incomes|recurring|distributions|projects|members)(\/|$)/,
    permission: "finance.manage",
  },
  {
    method: "DELETE",
    pattern:
      /^\/api\/finance\/(incomes|recurring|distributions|projects|members)(\/|$)/,
    permission: "finance.manage",
  },
  // аудит — manage
  {
    method: "GET",
    pattern: /^\/api\/finance\/audit$/,
    permission: "finance.manage",
  },
  // аппрув/отклонение — approve
  {
    method: "POST",
    pattern: /^\/api\/finance\/expenses\/[^/]+\/(approve|reject)$/,
    permission: "finance.approve",
  },
  // проекты, участники, настройки финансов — admin. Строго /projects и /members,
  // чтобы подпути (members проекта, link-user) не попали под admin-дубликат.
  {
    method: "POST",
    pattern: /^\/api\/finance\/projects$/,
    permission: "finance.admin",
  },
  {
    method: "PUT",
    pattern: /^\/api\/finance\/projects\/[^/]+\/members$/,
    permission: "finance.admin",
  },
  {
    method: "POST",
    pattern: /^\/api\/finance\/members$/,
    permission: "finance.admin",
  },
  {
    method: "POST",
    pattern: /^\/api\/finance\/members\/[^/]+\/link-user$/,
    permission: "finance.admin",
  },
  {
    method: "GET",
    pattern: /^\/api\/settings\/finance$/,
    permission: "finance.admin",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/settings\/finance$/,
    permission: "finance.admin",
  },
  {
    method: "GET",
    pattern: /^\/api\/settings\/telegram-groups(\/|$)/,
    permission: "finance.admin",
  },
  {
    method: "POST",
    pattern: /^\/api\/settings\/telegram-groups\/[^/]+\/approve$/,
    permission: "finance.admin",
  },
];

/** Публичные API-роуты (не требуют сессии). Middleware ими не занимается, т.к.
 * API исключены из matcher; список нужен хендлерам для единообразия. */
export const PUBLIC_API_PATHS = new Set(["/api/auth/telegram"]);

/** API-роуты, доступные любому авторизованному пользователю (проверка — в
 * хендлере). */
export const AUTHENTICATED_API_PATHS = new Set(["/api/profile/telegram-link"]);

export function routePermission(pathname: string): Permission | null {
  const hit = ROUTE_PERMISSIONS.find(
    r => pathname === r.prefix || pathname.startsWith(r.prefix + "/")
  );
  return hit ? hit.permission : null;
}

/** Право, требуемое для API-запроса по методу и пути. */
export function apiRoutePermission(
  method: string,
  pathname: string
): Permission | null {
  const upper = method.toUpperCase();
  const hit = API_ROUTE_PERMISSIONS.find(
    r => upper === r.method && r.pattern.test(pathname)
  );
  return hit ? hit.permission : null;
}
