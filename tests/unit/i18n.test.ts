// Юнит-тесты мультиязычности: выбор языка, подстановка, формы числа и —
// главное — совпадение наборов ключей в словарях.
//
// Расхождение словарей ловится именно здесь: без этого проверка «а всё ли
// переведено» сводится к тому, чтобы кто-то заметил ключ вместо текста на
// экране, а замечают такое обычно пользователи.

import test from "node:test";
import assert from "node:assert/strict";
import { ru } from "../../src/lib/i18n/ru";
import { en } from "../../src/lib/i18n/en";
import { makeT, formatNumber } from "../../src/lib/i18n/translate";
import {
  localeFromAcceptLanguage,
  resolveLocale,
  isLocale,
  LOCALES,
  DEFAULT_LOCALE,
} from "../../src/lib/i18n/config";

const PLURAL = /_(one|few|many|other)$/;
const base = (k: string) => k.replace(PLURAL, "");
const bases = (d: Record<string, string>) => new Set(Object.keys(d).map(base));

test("наборы ключей в словарях совпадают", () => {
  const r = bases(ru);
  const e = bases(en);
  const onlyRu = [...r].filter(k => !e.has(k)).sort();
  const onlyEn = [...e].filter(k => !r.has(k)).sort();
  assert.deepEqual(onlyRu, [], "есть только в русском");
  assert.deepEqual(onlyEn, [], "есть только в английском");
});

test("в каждом языке у форм числа есть все нужные варианты", () => {
  // Русскому мало one/other: 2 и 5 требуют разных слов. Английскому хватает
  // двух. Проверяем, что для каждого «множественного» ключа набор форм полон
  // именно для своего языка.
  const need: Record<string, string[]> = { ru: ["one", "few", "many"], en: ["one", "other"] };
  for (const [lang, dict] of [["ru", ru], ["en", en]] as const) {
    const plurals = new Set(
      Object.keys(dict)
        .filter(k => PLURAL.test(k))
        .map(base)
    );
    for (const k of plurals) {
      for (const form of need[lang]) {
        assert.ok(dict[`${k}_${form}`], `${lang}: нет ${k}_${form}`);
      }
    }
  }
});

test("в переводах нет незакрытых плейсхолдеров и лишних параметров", () => {
  // Набор {параметров} должен совпадать между языками: забытый {name} в одном
  // из них — это «Удалить «» из панели?» в проде.
  const params = (s: string) => (s.match(/\{(\w+)\}/g) || []).sort().join(",");
  for (const k of Object.keys(ru)) {
    if (!en[k]) continue;
    assert.equal(params(ru[k]), params(en[k]), `разные параметры в ключе ${k}`);
  }
});

test("подстановка параметров", () => {
  const t = makeT("ru");
  assert.equal(t("shell.role", { role: "ADMIN" }), "Роль: ADMIN");
  // Неизвестный параметр остаётся как есть — так видно, чего не хватает.
  assert.equal(t("err.http", {}), "Ошибка {status}");
  assert.equal(t("err.http", { status: 500 }), "Ошибка 500");
});

test("формы числа выбираются по правилам языка", () => {
  const r = makeT("ru");
  assert.equal(r("spend.count", { count: 1 }), "1 ресурс");
  assert.equal(r("spend.count", { count: 3 }), "3 ресурса");
  assert.equal(r("spend.count", { count: 7 }), "7 ресурсов");
  assert.equal(r("spend.count", { count: 21 }), "21 ресурс");
  assert.equal(r("spend.count", { count: 0 }), "0 ресурсов");

  const e = makeT("en");
  assert.equal(e("spend.count", { count: 1 }), "1 resource");
  assert.equal(e("spend.count", { count: 2 }), "2 resources");
  assert.equal(e("spend.count", { count: 21 }), "21 resources");
});

test("неизвестный ключ возвращается сам собой, а не пустой строкой", () => {
  // Пустая строка выглядела бы как сломанная вёрстка; ключ сразу называет
  // недостающую запись словаря.
  assert.equal(makeT("ru")("нет.такого.ключа"), "нет.такого.ключа");
});

// Названия монет — имена собственные: Bitcoin называется так на любом языке,
// и требовать здесь расхождения значило бы требовать выдуманного перевода.
const PROPER_NOUNS = new Set([
  "currency.USDT", "currency.USDC", "currency.BTC", "currency.ETH", "currency.TON",
  "currency.TRX", "currency.LTC", "currency.BNB", "currency.SOL", "currency.XMR",
]);

test("оба словаря реально переводят, а не повторяют друг друга", () => {
  // Сторож против «скопировал русский файл, забыл перевести»: если английский
  // словарь совпадает с русским больше чем в паре мест, перевода нет.
  const same = Object.keys(ru).filter(
    k => en[k] === ru[k] && !/^[\W\d]*$/.test(ru[k]) && !PROPER_NOUNS.has(k)
  );
  // Совпадения законны там, где переводить нечего: «VPN», коды, эмодзи.
  assert.ok(same.length < 10, `подозрительно много одинаковых строк: ${same.join(", ")}`);
});

test("язык из Accept-Language", () => {
  assert.equal(localeFromAcceptLanguage("en-US,en;q=0.9,ru;q=0.8"), "en");
  assert.equal(localeFromAcceptLanguage("ru-RU,ru;q=0.9"), "ru");
  // Неподдерживаемый язык — не повод молча выдать первый попавшийся.
  assert.equal(localeFromAcceptLanguage("de-DE,fr;q=0.9"), null);
  assert.equal(localeFromAcceptLanguage(null), null);
  assert.equal(localeFromAcceptLanguage(""), null);
});

test("resolveLocale не пропускает мусор", () => {
  assert.equal(resolveLocale("en"), "en");
  assert.equal(resolveLocale("ru"), "ru");
  // Всё непонятное сводится к языку по умолчанию, а не к первому попавшемуся.
  assert.equal(resolveLocale("de"), DEFAULT_LOCALE);
  assert.equal(resolveLocale(undefined), DEFAULT_LOCALE);
  assert.equal(resolveLocale({ toString: () => "en" }), DEFAULT_LOCALE);
  for (const l of LOCALES) assert.ok(isLocale(l));
  assert.ok(!isLocale("EN"));
});

test("числа форматируются по языку", () => {
  // Разделители разные, и это не косметика: «12.00» русскому читается как
  // двенадцать целых, а «12,00» англоязычному — как двенадцать сотен.
  assert.equal(formatNumber(1234.5, "en", { minimumFractionDigits: 2 }), "1,234.50");
  assert.equal(
    formatNumber(1234.5, "ru", { minimumFractionDigits: 2 }).replace(/ | /g, " "),
    "1 234,50"
  );
});

test("маркер ⚠️ в подтверждении удаления сохранён в обоих языках", () => {
  // По этому маркеру вебхук отрезает добавленный хвост от исходного текста
  // напоминания. Уберут его при переводе — «Нет» перестанет возвращать
  // сообщение в исходный вид.
  assert.ok(ru["bot.confirmDelete"].startsWith("⚠️"));
  assert.ok(en["bot.confirmDelete"].startsWith("⚠️"));
});
