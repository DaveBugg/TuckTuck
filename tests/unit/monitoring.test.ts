// Юнит-тесты мониторинга: статус по свежести снимка и разбор того, что
// прислал агент. Обе части чистые — проверяются без БД и без сети.
import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_INTERVAL_SEC,
  agoText,
  health,
  metricLevel,
  nonNegFloat,
  nonNegInt,
  pct,
  uptimeText,
} from "../../src/lib/monitoring";
import { makeT } from "../../src/lib/i18n/translate";

const now = new Date("2026-08-09T12:00:00Z");
const ago = (sec: number) => new Date(now.getTime() - sec * 1000);

test("статус: нет снимков — агент не подключён, а не «упал»", () => {
  // Разница смысловая: «никогда не присылал» и «перестал присылать» требуют
  // разных действий, и показывать первое красным было бы ложной тревогой.
  assert.equal(health(null, now), "unknown");
});

test("статус: свежий снимок — в сети", () => {
  assert.equal(health(ago(0), now), "up");
  assert.equal(health(ago(AGENT_INTERVAL_SEC), now), "up");
  // Ровно на пороге ещё «в сети»: cron просыпается неровно.
  assert.equal(health(ago(AGENT_INTERVAL_SEC * 3), now), "up");
});

test("статус: пропуск нескольких тиков — молчит, но ещё не упал", () => {
  // Три интервала запаса взяты не случайно: сеть моргает, машина
  // перезагружается. Порог в один интервал давал бы ложные «упал» каждый день.
  assert.equal(health(ago(AGENT_INTERVAL_SEC * 3 + 1), now), "stale");
  assert.equal(health(ago(600), now), "stale");
  assert.equal(health(ago(3600), now), "stale");
});

test("статус: молчит больше часа — не отвечает", () => {
  assert.equal(health(ago(3601), now), "down");
  assert.equal(health(ago(86400), now), "down");
});

test("проценты: мусор и выход за диапазон отбрасываются, а не клампятся", () => {
  // 150% значит, что агент прислал не то. Показать прочерк честнее, чем
  // нарисовать «100% диска» и отправить человека искать несуществующую беду.
  assert.equal(pct(150), null);
  assert.equal(pct(-1), null);
  assert.equal(pct("нечисло"), null);
  assert.equal(pct(null), null);
  assert.equal(pct(undefined), null);
  assert.equal(pct(NaN), null);
  // валидное сохраняется, округляется до десятых
  assert.equal(pct(0), 0);
  assert.equal(pct(100), 100);
  assert.equal(pct(13.74), 13.7);
  assert.equal(pct("42.5"), 42.5); // агент шлёт строкой — это нормально
});

test("аптайм и load: отрицательные и нечисловые отбрасываются", () => {
  assert.equal(nonNegInt(143024), 143024);
  assert.equal(nonNegInt("143024"), 143024);
  assert.equal(nonNegInt(-5), null);
  assert.equal(nonNegInt("abc"), null);
  assert.equal(nonNegFloat(0.55), 0.55);
  assert.equal(nonNegFloat(-0.1), null);
});

test("пороги подсветки", () => {
  assert.equal(metricLevel(null), "none");
  assert.equal(metricLevel(10), "ok");
  assert.equal(metricLevel(69.9), "ok");
  assert.equal(metricLevel(70), "warn");
  assert.equal(metricLevel(89.9), "warn");
  assert.equal(metricLevel(90), "crit");
  assert.equal(metricLevel(100), "crit");
});

test("аптайм словами", () => {
  const ru = makeT("ru");
  assert.equal(uptimeText(null, ru), "");
  assert.equal(uptimeText(0, ru), "");
  assert.equal(uptimeText(90, ru), "1 мин");
  assert.equal(uptimeText(3600, ru), "1 ч");
  assert.equal(uptimeText(3660, ru), "1 ч 1 мин");
  assert.equal(uptimeText(86400, ru), "1 дн.");
  assert.equal(uptimeText(140400, ru), "1 дн. 15 ч");
});

test("аптайм и на английском — те же числа, другие подписи", () => {
  const en = makeT("en");
  assert.equal(uptimeText(3660, en), "1h 1m");
  assert.equal(uptimeText(140400, en), "1d 15h");
});

test("«столько-то назад» выбирает форму по числу, а не сравнением с единицей", () => {
  const ru = makeT("ru");
  const now = new Date("2026-08-09T12:00:00Z");
  const ago = (min: number) => agoText(new Date(now.getTime() - min * 60_000), ru, now);
  assert.equal(ago(0), "только что");
  assert.equal(ago(1), "1 минуту назад");
  // 2 и 5 — разные формы; наивное «n===1 ? … : …» дало бы «2 минут назад».
  assert.equal(ago(2), "2 минуты назад");
  assert.equal(ago(5), "5 минут назад");
  assert.equal(ago(21), "21 минуту назад");
  assert.equal(ago(60), "1 час назад");
  assert.equal(ago(60 * 3), "3 часа назад");
  assert.equal(ago(60 * 24 * 2), "2 дня назад");
});

test("английский обходится двумя формами", () => {
  const en = makeT("en");
  const now = new Date("2026-08-09T12:00:00Z");
  const ago = (min: number) => agoText(new Date(now.getTime() - min * 60_000), en, now);
  assert.equal(ago(1), "1 minute ago");
  assert.equal(ago(5), "5 minutes ago");
  assert.equal(ago(21), "21 minutes ago");
});
