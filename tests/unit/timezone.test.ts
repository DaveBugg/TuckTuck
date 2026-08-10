// Проверка часового пояса перед подстановкой в SQL.
//
// Цена ошибки здесь выше обычной: имя пояса уходит в запрос ЛИТЕРАЛОМ (в
// ClickHouse зона обязана быть константой, параметром её не передать). Значит
// проверка — единственное, что стоит между полем формы и текстом SQL.

import { test } from "node:test";
import assert from "node:assert/strict";
import { safeTimezone, pgDayExpr } from "../../src/lib/timezone";

test("настоящие пояса проходят", () => {
  assert.equal(safeTimezone("Europe/Moscow"), "Europe/Moscow");
  assert.equal(safeTimezone("America/Argentina/Buenos_Aires"), "America/Argentina/Buenos_Aires");
  assert.equal(safeTimezone("UTC"), "UTC");
  assert.equal(safeTimezone("  Asia/Almaty  "), "Asia/Almaty");
});

test("несуществующий пояс отсекается системным списком", () => {
  assert.equal(safeTimezone("Europe/Mordor"), null);
  assert.equal(safeTimezone("Moscow"), null);
});

test("пустое и не-строка → null (значит UTC, как раньше)", () => {
  assert.equal(safeTimezone(""), null);
  assert.equal(safeTimezone("   "), null);
  assert.equal(safeTimezone(null), null);
  assert.equal(safeTimezone(undefined), null);
  assert.equal(safeTimezone(42), null);
});

test("попытки вырваться в SQL не проходят", () => {
  assert.equal(safeTimezone("UTC'; DROP TABLE events; --"), null);
  assert.equal(safeTimezone("Europe/Moscow' OR '1'='1"), null);
  assert.equal(safeTimezone("Europe/Moscow--"), null);
  assert.equal(safeTimezone("Europe Moscow"), null);
  assert.equal(safeTimezone("x".repeat(65)), null);
});

test("выражения дня: с поясом и без", () => {
  // мусорный пояс НЕ должен превратиться в SQL — падаем на UTC
  assert.equal(pgDayExpr("злой'", '"paidAt"'), `date_trunc('day', "paidAt")`);
  assert.equal(
    pgDayExpr("Europe/Moscow", '"occurredAt"'),
    `date_trunc('day', "occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow')`
  );
  assert.equal(pgDayExpr(null, '"occurredAt"'), `date_trunc('day', "occurredAt")`);
});
