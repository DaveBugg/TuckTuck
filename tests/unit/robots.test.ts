// Запрет индексации — проверка всех трёх слоёв на уровне исходников.
//
// Тест сторожевой: он не поднимает сервер, а следит, чтобы слои не исчезли при
// правках конфигов. Панель светит наружу домен, за которым лежат суммы, даты
// оплат и адреса серверов; попадание в поиск здесь — не косметика.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import robots from "../../src/app/robots";

test("robots.txt закрывает весь сайт", () => {
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
  assert.ok(rules.length > 0);
  for (const rule of rules) {
    assert.equal(rule.userAgent, "*");
    assert.equal(rule.disallow, "/");
    // Разрешающего правила быть не должно: одно `allow` перебивает disallow
    // для своей ветки, и закрытым останется не весь сайт.
    assert.equal(rule.allow, undefined);
  }
  // Карта сайта у закрытой панели — приглашение обойти всё остальное.
  assert.equal(r.sitemap, undefined);
});

test("мета-тег в корневом layout запрещает индексацию", () => {
  const src = fs.readFileSync("src/app/layout.tsx", "utf8");
  assert.match(src, /robots:\s*\{[^}]*index:\s*false/);
  assert.match(src, /robots:\s*\{[^}]*follow:\s*false/);
});

test("заголовок X-Robots-Tag отдаётся приложением на все пути", () => {
  // Из самого приложения, а не только из Caddy: с TUCKTUCK_SKIP_PROXY=1 панель
  // работает за чужим прокси, и заголовок из нашего конфига до неё не доедет.
  const cfg = fs.readFileSync("next.config.js", "utf8");
  assert.match(cfg, /X-Robots-Tag/);
  assert.match(cfg, /noindex/);
  assert.match(cfg, /source:\s*"\/:path\*"/);
});

test("Caddy тоже ставит заголовок — для тех, кто ставит стек целиком", () => {
  const caddy = fs.readFileSync("caddy/Caddyfile", "utf8");
  assert.match(caddy, /X-Robots-Tag\s+"noindex/);
});
