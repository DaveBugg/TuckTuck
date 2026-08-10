"use client";
// Клиентская сторона единой системы прав: роль из читаемой tt_user cookie +
// те же ROLE_PERMISSIONS, что на сервере/edge. Только для UI-видимости
// (сервер всегда перепроверяет через requirePermission).
import { useCallback, useEffect, useMemo, useState } from "react";
import Cookies from "js-cookie";
import { hasPermission, type Permission, type Role } from "./permissions";

export type CurrentUser = { id?: string; name?: string; email?: string; role?: Role };

export function useCurrentUser(): CurrentUser {
  const [user, setUser] = useState<CurrentUser>({});
  useEffect(() => {
    try {
      const raw = Cookies.get("tt_user");
      if (raw) setUser(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  return user;
}

/**
 * Права текущего пользователя.
 *
 * Ссылки СТАБИЛЬНЫЕ, и это не микрооптимизация. Раньше здесь возвращался новый
 * объект с новой функцией на каждый рендер. Стоит положить `can` в зависимости
 * useEffect — и получается вечный цикл: эффект → setState → рендер → новая
 * функция → эффект. Именно так дашборд отправил под сотню запросов подряд.
 *
 * Держать стабильность на стороне хука, а не просить каждого потребителя
 * помнить про это, — единственный способ не наступить снова.
 */
export function usePermissions(): { role?: Role; can: (perm: Permission) => boolean } {
  const user = useCurrentUser();
  const role = user.role;

  const can = useCallback((perm: Permission) => hasPermission(role, perm), [role]);

  return useMemo(() => ({ role, can }), [role, can]);
}
