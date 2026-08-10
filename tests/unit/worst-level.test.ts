// Цвет значка мониторинга в списке ресурсов: худшее из состояний машины.

import test from "node:test";
import assert from "node:assert/strict";
import { worstLevel } from "../../src/lib/monitoring";

const s = (over: Partial<Parameters<typeof worstLevel>[0]> = {}) => ({
  health: "up" as const,
  cpu: 10,
  memory: 20,
  disk: 30,
  ...over,
});

test("всё спокойно — обычный цвет", () => {
  assert.equal(worstLevel(s()), "ok");
});

test("любая нагруженная метрика поднимает уровень до предупреждения", () => {
  assert.equal(worstLevel(s({ memory: 78 })), "warn");
  assert.equal(worstLevel(s({ cpu: 70 })), "warn", "порог включительно");
  assert.equal(worstLevel(s({ disk: 89 })), "warn");
});

test("критичная метрика важнее предупреждающей", () => {
  // Ровно случай со скриншота: память оранжевая, диск зелёный — значок должен
  // показывать худшее, а не первое попавшееся.
  assert.equal(worstLevel(s({ memory: 78, disk: 95 })), "crit");
  assert.equal(worstLevel(s({ cpu: 90 })), "crit");
});

test("молчащая машина важнее её же цифр", () => {
  // У неё метрики устарели, и зелёный «6% CPU» у мёртвого сервера — обман.
  assert.equal(worstLevel(s({ health: "stale", cpu: 1, memory: 1, disk: 1 })), "warn");
  assert.equal(worstLevel(s({ health: "down", cpu: 1, memory: 1, disk: 1 })), "crit");
  assert.equal(worstLevel(s({ health: "unknown" })), "none");
});

test("без единой метрики уровень неизвестен, а не «хорошо»", () => {
  // Зелёный значок был бы обещанием, которого никто не давал.
  assert.equal(worstLevel(s({ cpu: null, memory: null, disk: null })), "none");
  // Хотя бы одна известная метрика уже даёт основание для оценки.
  assert.equal(worstLevel(s({ cpu: null, memory: null, disk: 5 })), "ok");
});
