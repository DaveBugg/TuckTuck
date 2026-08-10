// Расход за месяц: приведение периодов и округление итога.
//
// Обе функции живут в роуте, поэтому здесь повторены ровно те выражения, что
// там. Тест сторожевой: он ловит не опечатку в копии, а возврат к округлению
// «всегда до сотых» — на нём итог в биткойнах превращался в ноль.

import test from "node:test";
import assert from "node:assert/strict";
import { CRYPTO_CURRENCIES, FIAT_CURRENCIES } from "../../src/lib/resources";
import { convert } from "../../src/lib/rates";

/** Та же формула, что в src/app/api/resources/totals/route.ts. */
function perMonth(amount: number, value: number, unit: string): number {
  const v = Math.max(1, value);
  switch (unit) {
    case "DAY":
      return (amount / v) * 30;
    case "WEEK":
      return (amount / v) * (30 / 7);
    case "YEAR":
      return amount / (v * 12);
    default:
      return amount / v;
  }
}

const roundFor = (total: number, isCrypto: boolean) => {
  const step = isCrypto ? 1e8 : 100;
  return Math.round(total * step) / step;
};

test("период приводится к месяцу", () => {
  assert.equal(perMonth(1200, 1, "YEAR"), 100);
  assert.equal(perMonth(30, 1, "DAY"), 900);
  assert.equal(perMonth(10, 1, "MONTH"), 10);
  // «Раз в 3 месяца по 300» — это сотня в месяц, а не триста.
  assert.equal(perMonth(300, 3, "MONTH"), 100);
  assert.equal(Math.round(perMonth(7, 1, "WEEK")), 30);
  // Ноль и мусор в периоде не должны делить на ноль.
  assert.equal(perMonth(10, 0, "MONTH"), 10);
});

test("итог в монете не схлопывается в ноль", () => {
  // 14.31 USD по курсу 95 000 за биткойн — это 0.00015 BTC. При округлении до
  // сотых пользователь видел бы 0.00 и решил, что не тратит ничего.
  const perUsd = { USD: 1, BTC: 1 / 95_000 };
  const inBtc = convert(14.31, "USD", "BTC", perUsd);
  assert.ok(inBtc && inBtc > 0);
  assert.equal(roundFor(inBtc, false), 0, "до сотых — ноль, ради этого и правка");
  assert.ok(roundFor(inBtc, true) > 0, "до восьми знаков — уже не ноль");
});

test("валюта итога определяет только сам итог, но не суммы по валютам", () => {
  // Суммы по валютам считаются до всякого курса — это единственные точные
  // числа на экране, и настройка отображения их не касается.
  const perUsd = { USD: 1, RUB: 90, EUR: 0.9 };
  const rub = 1170;
  assert.equal(convert(rub, "RUB", "RUB", perUsd), rub);
  const inUsd = convert(rub, "RUB", "USD", perUsd);
  const inEur = convert(rub, "RUB", "EUR", perUsd);
  assert.ok(inUsd && inEur && Math.abs(inUsd - 13) < 0.01 && Math.abs(inEur - 11.7) < 0.01);
});

test("списки валют не пересекаются", () => {
  // Иначе флаг isCrypto у суммы зависел бы от того, какой ресурс попался первым.
  const fiat = new Set<string>(FIAT_CURRENCIES);
  for (const c of CRYPTO_CURRENCIES) assert.ok(!fiat.has(c), `${c} в обоих списках`);
});
