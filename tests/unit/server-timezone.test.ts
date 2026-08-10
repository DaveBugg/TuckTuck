// Пояс хоста, а не контейнера.
//
// Тест написан по следам живой находки: сервер стоит в Europe/Moscow, а внутри
// контейнера Intl честно отвечает UTC — переменной TZ там нет. По UTC суточное
// распределение нагрузки съезжает на три часа, и «пик в 20:00» оказывается в
// 23:00.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { serverTimezone } from "../../src/lib/settings";

/** Хостовый корень с /etc/timezone внутри — как он примонтирован в контейнер. */
function fakeHostRoot(zone: string | null, link?: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tt-tz-"));
  fs.mkdirSync(path.join(root, "etc"), { recursive: true });
  if (zone) fs.writeFileSync(path.join(root, "etc/timezone"), zone + "\n");
  if (link) fs.symlinkSync(link, path.join(root, "etc/localtime"));
  return root;
}

test("TZ важнее всего: явная настройка не перебивается файлами хоста", () => {
  process.env.TZ = "Asia/Tbilisi";
  process.env.TUCKTUCK_HOST_ROOT = fakeHostRoot("Europe/Moscow");
  assert.equal(serverTimezone(), "Asia/Tbilisi");
  delete process.env.TZ;
});

test("без TZ берём /etc/timezone хоста", () => {
  delete process.env.TZ;
  process.env.TUCKTUCK_HOST_ROOT = fakeHostRoot("Europe/Moscow");
  assert.equal(serverTimezone(), "Europe/Moscow");
});

test("мусор в файле хоста игнорируется, а не уезжает в настройки", () => {
  delete process.env.TZ;
  process.env.TUCKTUCK_HOST_ROOT = fakeHostRoot("не пояс");
  // Пояс процесса в тестах — UTC; главное, что мусор не прошёл насквозь.
  assert.notEqual(serverTimezone(), "не пояс");
});

test("без /etc/timezone читаем ссылку /etc/localtime", t => {
  delete process.env.TZ;
  let root: string;
  try {
    root = fakeHostRoot(null, "/usr/share/zoneinfo/America/New_York");
  } catch {
    // Windows без прав на симлинки — случай не про логику, а про песочницу.
    t.skip("симлинки недоступны");
    return;
  }
  process.env.TUCKTUCK_HOST_ROOT = root;
  assert.equal(serverTimezone(), "America/New_York");
});
