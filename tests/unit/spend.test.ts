// Расписание платежей по календарным месяцам.
//
// Проверяется главное свойство новой логики: сумма месяца — это то, что в нём
// реально платят, а не годовой счёт, размазанный по двенадцати месяцам.

import test from "node:test";
import assert from "node:assert/strict";
import { occurrencesBetween, amountBetween, monthRange, sumByCurrency, byMonth } from "../../src/lib/spend";

const res = (over: Partial<Parameters<typeof amountBetween>[0]> = {}) => ({
  amount: "100",
  currency: "USD",
  isCrypto: false,
  periodValue: 1,
  periodUnit: "MONTH",
  nextPaymentAt: new Date(Date.UTC(2026, 7, 15)), // 15 августа 2026
  ...over,
});

const monthAmount = (r: any, year: number, m: number) => {
  const { from, to } = monthRange(year, m);
  return amountBetween(r, from, to);
};

test("годовая подписка попадает ровно в свой месяц, а не в каждый", () => {
  // Ровно то, ради чего всё переписано: усреднение показывало бы 100 в любом
  // месяце, хотя платят один раз в марте.
  const r = res({
    amount: "1200",
    periodValue: 1,
    periodUnit: "YEAR",
    nextPaymentAt: new Date(Date.UTC(2026, 2, 10)),
  });
  assert.equal(monthAmount(r, 2026, 2), 1200, "в марте платёж есть");
  for (const m of [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    assert.equal(monthAmount(r, 2026, m), 0, `в месяце ${m} платежа быть не должно`);
  }
});

test("прошлые месяцы года считаются так же, как будущие", () => {
  // Якорь — в августе, но январский платёж по ежемесячной подписке был, и
  // динамика за год не должна обрываться на сегодняшнем дне.
  const r = res();
  for (let m = 0; m < 12; m++) assert.equal(monthAmount(r, 2026, m), 100, `месяц ${m}`);
});

test("квартальная подписка даёт четыре пика в году", () => {
  const r = res({
    amount: "300",
    periodValue: 3,
    periodUnit: "MONTH",
    nextPaymentAt: new Date(Date.UTC(2026, 7, 1)), // август
  });
  const hits = Array.from({ length: 12 }, (_, m) => monthAmount(r, 2026, m));
  assert.deepEqual(hits, [0, 300, 0, 0, 300, 0, 0, 300, 0, 0, 300, 0]);
  assert.equal(hits.filter(x => x > 0).length, 4);
});

test("тридцатидневный период иногда даёт два платежа в месяце", () => {
  // Именно поэтому 30 дней и календарный месяц — разные вещи: за январь при
  // шаге в 30 дней платят дважды, если первый платёж пришёлся на начало.
  const r = res({
    amount: "10",
    periodValue: 30,
    periodUnit: "DAY",
    nextPaymentAt: new Date(Date.UTC(2026, 0, 1)),
  });
  assert.equal(monthAmount(r, 2026, 0), 20, "1 и 31 января");
});

test("интервал полуоткрытый: платёж первого числа принадлежит своему месяцу", () => {
  const r = res({ nextPaymentAt: new Date(Date.UTC(2026, 5, 1)) });
  assert.equal(monthAmount(r, 2026, 5), 100);
  const june = monthRange(2026, 5);
  const dates = occurrencesBetween(r, june.from, june.to).map(d => d.toISOString().slice(0, 10));
  assert.deepEqual(dates, ["2026-06-01"]);
});

test("суммы сводятся по валютам и не смешиваются", () => {
  const rows = [
    res({ amount: "100", currency: "USD" }),
    res({ amount: "50", currency: "usd" }), // регистр не должен плодить валюту
    res({ amount: "1000", currency: "RUB" }),
  ];
  const { from, to } = monthRange(2026, 7);
  const sums = sumByCurrency(rows, from, to);
  assert.deepEqual(
    sums.map(s => [s.currency, s.amount, s.count]),
    [
      ["RUB", 1000, 1],
      ["USD", 150, 2],
    ]
  );
});

test("год целиком: двенадцать месяцев, у каждого свои валюты", () => {
  const rows = [
    res({ amount: "10", currency: "USD" }), // ежемесячно
    res({
      amount: "600",
      currency: "EUR",
      periodValue: 6,
      periodUnit: "MONTH",
      nextPaymentAt: new Date(Date.UTC(2026, 0, 20)),
    }),
  ];
  const months = byMonth(rows, 2026);
  assert.equal(months.length, 12);
  assert.equal(months[0].find(c => c.currency === "EUR")?.amount, 600);
  assert.equal(months[6].find(c => c.currency === "EUR")?.amount, 600);
  assert.equal(months[3].find(c => c.currency === "EUR"), undefined);
  for (let m = 0; m < 12; m++) {
    assert.equal(months[m].find(c => c.currency === "USD")?.amount, 10, `USD в месяце ${m}`);
  }
});

test("крипта не схлопывается в ноль при округлении", () => {
  const rows = [res({ amount: "0.0004", currency: "BTC", isCrypto: true })];
  const { from, to } = monthRange(2026, 7);
  assert.equal(sumByCurrency(rows, from, to)[0].amount, 0.0004);
});
