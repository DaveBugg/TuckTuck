// Юнит-тесты единой системы прав: карты ролей, hasPermission, routePermission.
import test from "node:test";
import assert from "node:assert/strict";
import {
  hasPermission,
  routePermission,
  apiRoutePermission,
  ROLE_PERMISSIONS,
  type Permission,
} from "../../src/lib/permissions";

test("ADMIN имеет все права, определённые в системе", () => {
  const all = new Set<Permission>();
  for (const set of Object.values(ROLE_PERMISSIONS))
    for (const p of set) all.add(p);
  for (const p of all)
    assert.ok(hasPermission("ADMIN", p), `ADMIN должен иметь ${p}`);
});

test("матрица прав по ролям", () => {
  // управление ботами — только админ
  assert.ok(hasPermission("ADMIN", "notify.manage"));
  assert.ok(!hasPermission("USER", "notify.manage"));
  // управление пользователями — только админ
  assert.ok(hasPermission("ADMIN", "users.view"));
  assert.ok(hasPermission("ADMIN", "users.manage"));
  assert.ok(!hasPermission("USER", "users.view"));
  assert.ok(!hasPermission("USER", "users.manage"));
  // общий дашборд — обеим ролям
  assert.ok(hasPermission("ADMIN", "dashboard.view"));
  assert.ok(hasPermission("USER", "dashboard.view"));
});

test("hasPermission: пустая/неизвестная роль — всегда false", () => {
  assert.ok(!hasPermission(null, "dashboard.view"));
  assert.ok(!hasPermission(undefined, "dashboard.view"));
  assert.ok(!hasPermission("", "dashboard.view"));
  assert.ok(!hasPermission("HACKER", "dashboard.view"));
  // роли из прежней (донорской) матрицы не должны случайно получить права
  assert.ok(!hasPermission("MANAGER", "dashboard.view"));
});

test("routePermission: префиксы и не-префиксы", () => {
  assert.equal(routePermission("/users"), "users.view");
  assert.equal(routePermission("/resources"), "resources.view");
  assert.equal(routePermission("/resources/abc"), "resources.view");
  assert.equal(routePermission("/notifications"), "notify.manage");
  // граница сегмента: /resources-archive НЕ должен матчить /resources
  assert.equal(routePermission("/resources-archive"), null);
  assert.equal(routePermission("/dashboard"), null); // общая страница — без гейта
  assert.equal(routePermission("/profile"), null);
  // Finance Board — страницы
  assert.equal(routePermission("/finance"), "finance.view");
  assert.equal(routePermission("/finance/expenses"), "finance.view");
  assert.equal(routePermission("/finance-board"), null); // не /finance
});

test("права Finance Board по ролям", () => {
  assert.ok(hasPermission("ADMIN", "finance.view"));
  assert.ok(hasPermission("ADMIN", "finance.submit"));
  assert.ok(hasPermission("ADMIN", "finance.approve"));
  assert.ok(hasPermission("ADMIN", "finance.manage"));
  assert.ok(hasPermission("ADMIN", "finance.admin"));
  // USER может только submit
  assert.ok(hasPermission("USER", "finance.submit"));
  assert.ok(!hasPermission("USER", "finance.view"));
  assert.ok(!hasPermission("USER", "finance.approve"));
  assert.ok(!hasPermission("USER", "finance.manage"));
  assert.ok(!hasPermission("USER", "finance.admin"));
});

test("apiRoutePermission: метод + путь → право", () => {
  assert.equal(
    apiRoutePermission("GET", "/api/finance/summary"),
    "finance.view"
  );
  assert.equal(
    apiRoutePermission("POST", "/api/finance/expenses"),
    "finance.submit"
  );
  assert.equal(
    apiRoutePermission("PATCH", "/api/finance/expenses/123"),
    "finance.submit"
  );
  assert.equal(
    apiRoutePermission("DELETE", "/api/finance/expenses/123"),
    "finance.submit"
  );
  assert.equal(
    apiRoutePermission("GET", "/api/finance/audit"),
    "finance.manage"
  );
  assert.equal(
    apiRoutePermission("POST", "/api/finance/expenses/123/approve"),
    "finance.approve"
  );
  assert.equal(
    apiRoutePermission("POST", "/api/finance/expenses/123/reject"),
    "finance.approve"
  );
  assert.equal(
    apiRoutePermission("POST", "/api/finance/projects"),
    "finance.admin"
  );
  assert.equal(
    apiRoutePermission("PUT", "/api/finance/projects/123/members"),
    "finance.admin"
  );
  assert.equal(
    apiRoutePermission("POST", "/api/finance/members"),
    "finance.admin"
  );
  assert.equal(
    apiRoutePermission("GET", "/api/settings/finance"),
    "finance.admin"
  );
  assert.equal(
    apiRoutePermission("PATCH", "/api/settings/finance"),
    "finance.admin"
  );
  // неизвестный API-путь — null
  assert.equal(apiRoutePermission("GET", "/api/unknown"), null);
});
