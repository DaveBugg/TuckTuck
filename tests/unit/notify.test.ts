// Юнит-тесты рассылки: фильтр «кому этот ресурс интересен» и текст сообщения.
// Обе функции чистые — проверяются без сети и без БД.
import test from "node:test";
import assert from "node:assert/strict";
import { botMatches, reminderText, reminderButtons } from "../../src/lib/notify";
import { makeT } from "../../src/lib/i18n/translate";

const res = (kind: string, tagIds: string[] = []) => ({
  kind,
  tags: tagIds.map(tagId => ({ tagId })),
});
const bot = (kinds: string[] = [], tagIds: string[] = []) => ({
  kinds,
  tags: tagIds.map(tagId => ({ tagId })),
});

test("пустой фильтр = шлём всё (а не «ничего»)", () => {
  // Это главная ловушка: свежесозданный бот без настроек должен слать всё,
  // иначе он молча молчит и выглядит сломанным.
  assert.ok(botMatches(bot(), res("SERVER")));
  assert.ok(botMatches(bot(), res("DOMAIN", ["t1"])));
});

test("фильтр по типу", () => {
  assert.ok(botMatches(bot(["SERVER", "VPN"]), res("SERVER")));
  assert.ok(botMatches(bot(["SERVER", "VPN"]), res("VPN")));
  assert.ok(!botMatches(bot(["SERVER", "VPN"]), res("DOMAIN")));
});

test("фильтр по тегам: достаточно одного совпадения", () => {
  assert.ok(botMatches(bot([], ["t1"]), res("SERVER", ["t1", "t2"])));
  assert.ok(botMatches(bot([], ["t1", "t3"]), res("SERVER", ["t3"])));
  assert.ok(!botMatches(bot([], ["t1"]), res("SERVER", ["t2"])));
  // тег задан у бота, а у ресурса тегов нет вовсе
  assert.ok(!botMatches(bot([], ["t1"]), res("SERVER", [])));
});

test("тип и теги работают вместе (И, а не ИЛИ)", () => {
  const b = bot(["SERVER"], ["t1"]);
  assert.ok(botMatches(b, res("SERVER", ["t1"])));
  assert.ok(!botMatches(b, res("SERVER", ["t2"])), "тип совпал, тег нет — не шлём");
  assert.ok(!botMatches(b, res("DOMAIN", ["t1"])), "тег совпал, тип нет — не шлём");
});

const base = {
  kind: "SERVER",
  name: "web-01",
  amount: "12.00",
  currency: "USD",
  periodValue: 1,
  periodUnit: "MONTH",
  nextPaymentAt: new Date(Date.UTC(2026, 7, 11)),
  providerName: "Hetzner",
};

test("текст: срок словами, а не числом «через 0 дн.»", () => {
  // Язык называем явно: по умолчанию панель говорит по-английски, а формы
  // числа проверяются именно русские — их три, и ошибиться легче всего в них.
  const ru = makeT("ru");
  const say = (daysBefore: number) => reminderText({ ...base, daysBefore }, ru, "ru");
  assert.match(say(0), /сегодня/);
  assert.match(say(1), /завтра/);
  // Именно «5 дней», а не «5 дня»: форму выбирает Intl по числу.
  assert.match(say(5), /через <b>5 дней<\/b>/);
  assert.match(say(2), /через <b>2 дня<\/b>/);
});

test("текст: язык бота меняет и слова, и разделитель в сумме", () => {
  const en = makeT("en");
  const msg = reminderText({ ...base, daysBefore: 5 }, en, "en");
  assert.match(msg, /in <b>5 days<\/b>/);
  assert.match(msg, /12\.00 USD/); // en-US: точка, а не запятая
  assert.match(msg, /monthly/);
  assert.match(msg, /Server/);
});

test("текст: сумма, период, провайдер и дата на месте", () => {
  const t = reminderText({ ...base, daysBefore: 2 }, makeT("ru"), "ru");
  assert.match(t, /web-01/);
  assert.match(t, /12,00 USD/);
  assert.match(t, /ежемесячно/);
  assert.match(t, /Hetzner/);
  assert.match(t, /2026-08-11/);
});

test("текст: HTML в имени экранируется, разметку не ломает", () => {
  // Имя приходит от человека; неэкранированный < превратил бы сообщение в
  // «Bad Request: can't parse entities» и напоминание бы не ушло.
  const t = reminderText({ ...base, name: "a<b> & c", daysBefore: 1 });
  assert.match(t, /a&lt;b&gt; &amp; c/);
  assert.ok(!t.includes("<b> &"), "сырой тег не должен просочиться");
});

test("текст: адрес показывается по типу", () => {
  assert.match(reminderText({ ...base, ip: "10.0.0.1", daysBefore: 1 }), /10\.0\.0\.1/);
  assert.match(
    reminderText({ ...base, kind: "DOMAIN", domain: "example.com", daysBefore: 1 }),
    /example\.com/
  );
  assert.match(
    reminderText({ ...base, kind: "SERVICE", url: "https://x.io/bill", daysBefore: 1 }),
    /https:\/\/x\.io\/bill/
  );
});

test("кнопки: оплата, отмена и удаление, все с ключом сообщения", () => {
  const rows = reminderButtons("msg-42");
  const all = rows.flat();
  assert.equal(all.length, 3);
  assert.deepEqual(
    all.map(b => b.callback_data),
    ["paid:msg-42", "cancel:msg-42", "del:msg-42"]
  );
  // callback_data Телеграм ограничивает 64 байтами — ключ обязан влезать
  for (const b of all) assert.ok(Buffer.byteLength(b.callback_data) <= 64);
});
