// Окно оповещений: когда молчать и чьё окно важнее.

import test from "node:test";
import assert from "node:assert/strict";
import {
  isWithinWindow,
  isQuietAlways,
  hourInTimezone,
  parseHour,
  windowFor,
} from "../../src/lib/quiet-hours";

test("равные часы — ограничения нет", () => {
  assert.ok(isQuietAlways(0, 0));
  assert.ok(isQuietAlways(9, 9));
  for (let h = 0; h < 24; h++) assert.ok(isWithinWindow(h, 0, 0));
});

test("обычное окно: конец не включается", () => {
  // 9–21 люди читают как «до 21:00», то есть 21:00 уже поздно.
  assert.ok(!isWithinWindow(8, 9, 21));
  assert.ok(isWithinWindow(9, 9, 21));
  assert.ok(isWithinWindow(20, 9, 21));
  assert.ok(!isWithinWindow(21, 9, 21));
  assert.ok(!isWithinWindow(3, 9, 21));
});

test("окно через полночь — для ночных дежурств", () => {
  assert.ok(isWithinWindow(23, 22, 7));
  assert.ok(isWithinWindow(0, 22, 7));
  assert.ok(isWithinWindow(6, 22, 7));
  assert.ok(!isWithinWindow(7, 22, 7));
  assert.ok(!isWithinWindow(12, 22, 7));
});

test("час считается в нужном поясе, а не в UTC", () => {
  // 2026-08-10T21:30Z — это уже следующие сутки в Москве.
  const d = new Date("2026-08-10T21:30:00Z");
  assert.equal(hourInTimezone(d, "UTC"), 21);
  assert.equal(hourInTimezone(d, "Europe/Moscow"), 0);
  assert.equal(hourInTimezone(d, "America/New_York"), 17);
  // Неизвестный пояс не должен глушить оповещения совсем.
  assert.equal(hourInTimezone(d, "Нет/Такого"), 21);
});

test("переход на летнее время не сдвигает час", () => {
  // Один и тот же пояс, разное смещение: считать сдвигом на фиксированное
  // число часов было бы неверно дважды в год.
  const winter = new Date("2026-01-15T12:00:00Z");
  const summer = new Date("2026-07-15T12:00:00Z");
  assert.equal(hourInTimezone(winter, "Europe/Berlin"), 13);
  assert.equal(hourInTimezone(summer, "Europe/Berlin"), 14);
});

test("часы разбираются строго", () => {
  assert.equal(parseHour(0), 0);
  assert.equal(parseHour("23"), 23);
  assert.equal(parseHour(24), null);
  assert.equal(parseHour(-1), null);
  assert.equal(parseHour(9.5), null);
  assert.equal(parseHour("вечер"), null);
  assert.equal(parseHour(null), null);
});

test("окно бота важнее общего, но только если задано целиком", () => {
  const global = { notifyFromHour: 9, notifyToHour: 21 };
  assert.deepEqual(windowFor({ notifyFromHour: 0, notifyToHour: 0 }, global), { from: 0, to: 0 });
  assert.deepEqual(windowFor({ notifyFromHour: 10, notifyToHour: 20 }, global), {
    from: 10,
    to: 20,
  });
  // Половина окна — это не окно: гадать за пользователя не нужно.
  assert.deepEqual(windowFor({ notifyFromHour: 10, notifyToHour: null }, global), {
    from: 9,
    to: 21,
  });
  assert.deepEqual(windowFor({ notifyFromHour: null, notifyToHour: null }, global), {
    from: 9,
    to: 21,
  });
});
