// Юнит-тесты «каким панель видна снаружи».
//
// Тест написан по следам живой ошибки: установка агента по SSH прошла все шаги
// и упала на пробной отправке, потому что агенту достался origin запроса —
// внутри контейнера это https://0.0.0.0:3000.

import test from "node:test";
import assert from "node:assert/strict";
import { panelBaseUrl } from "../../src/lib/panel-url";

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

test("явная настройка важнее всего", () => {
  process.env.TUCKTUCK_PUBLIC_URL = "https://panel.example.com/";
  assert.equal(
    panelBaseUrl(req("http://0.0.0.0:3000/api/x", { host: "other.example" })),
    "https://panel.example.com"
  );
  delete process.env.TUCKTUCK_PUBLIC_URL;
});

test("без настройки берём заголовки обратного прокси", () => {
  delete process.env.TUCKTUCK_PUBLIC_URL;
  assert.equal(
    panelBaseUrl(
      req("http://0.0.0.0:3000/api/x", {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "panel.example.com",
      })
    ),
    "https://panel.example.com"
  );
  // Заголовки прокси приходят списком, когда прокси несколько.
  assert.equal(
    panelBaseUrl(
      req("http://0.0.0.0:3000/api/x", {
        "x-forwarded-proto": "https, http",
        "x-forwarded-host": "panel.example.com, inner",
      })
    ),
    "https://panel.example.com"
  );
});

test("0.0.0.0 не отдаётся никогда — по нему не придёт никто", () => {
  delete process.env.TUCKTUCK_PUBLIC_URL;
  // Ровно тот случай, который сломал первую установку.
  assert.equal(panelBaseUrl(req("http://0.0.0.0:3000/api/x")), null);
  // И настройка с таким адресом тоже не годится: она не лучше origin.
  process.env.TUCKTUCK_PUBLIC_URL = "http://0.0.0.0:3000";
  assert.equal(panelBaseUrl(req("http://0.0.0.0:3000/api/x")), null);
  delete process.env.TUCKTUCK_PUBLIC_URL;
});

test("origin запроса — последняя надежда, для запуска без прокси", () => {
  delete process.env.TUCKTUCK_PUBLIC_URL;
  // Ни настройки, ни заголовков прокси — остаётся адрес самого запроса.
  // Схему при этом не выдумываем: без прокси https взяться неоткуда.
  assert.equal(panelBaseUrl(new Request("http://192.168.1.10:3000/api/x")), "http://192.168.1.10:3000");
});

test("мусор в настройке игнорируется, а не уезжает на чужую машину", () => {
  process.env.TUCKTUCK_PUBLIC_URL = "не адрес";
  assert.equal(
    panelBaseUrl(req("http://0.0.0.0:3000/api/x", { "x-forwarded-host": "ok.example" })),
    "https://ok.example"
  );
  process.env.TUCKTUCK_PUBLIC_URL = "ftp://panel.example.com";
  assert.equal(
    panelBaseUrl(req("http://0.0.0.0:3000/api/x", { "x-forwarded-host": "ok.example" })),
    "https://ok.example"
  );
  delete process.env.TUCKTUCK_PUBLIC_URL;
});
