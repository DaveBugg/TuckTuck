// Юнит-тесты единой системы прав: карты ролей, hasPermission, routePermission.
import test from "node:test";
import assert from "node:assert/strict";
import {
  hasPermission,
  routePermission,
  ROLE_PERMISSIONS,
  type Permission,
} from "../../src/lib/permissions";

test("ADMIN имеет все права, определённые в системе", () => {
  const all = new Set<Permission>();
  for (const set of Object.values(ROLE_PERMISSIONS)) for (const p of set) all.add(p);
  for (const p of all) assert.ok(hasPermission("ADMIN", p), `ADMIN должен иметь ${p}`);
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
});
