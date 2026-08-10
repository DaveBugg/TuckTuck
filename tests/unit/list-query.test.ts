// Юнит-тесты parseListParams: whitelist сортировки, clamp pageSize, фильтры.
import test from "node:test";
import assert from "node:assert/strict";
import { parseListParams } from "../../src/lib/list-query";

const OPTS = { sortable: ["createdAt", "name"], defaultSort: "createdAt" };
const url = (qs: string) => `http://x/api/test?${qs}`;

test("дефолты", () => {
  const p = parseListParams(url(""), OPTS);
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, 10);
  assert.equal(p.sort, "createdAt");
  assert.equal(p.order, "desc");
  assert.equal(p.skip, 0);
  assert.equal(p.search, "");
});

test("sort вне whitelist откатывается на дефолт (инъекция колонок невозможна)", () => {
  const p = parseListParams(url("sort=passwordHash&order=asc"), OPTS);
  assert.equal(p.sort, "createdAt");
  assert.equal(p.order, "asc");
});

test("pageSize клампится (потолок 100, отрицательный → 1, 0/мусор → дефолт 10)", () => {
  assert.equal(parseListParams(url("pageSize=100000"), OPTS).pageSize, 100);
  assert.equal(parseListParams(url("pageSize=0"), OPTS).pageSize, 10); // falsy → дефолт
  assert.equal(parseListParams(url("pageSize=abc"), OPTS).pageSize, 10);
  assert.equal(parseListParams(url("pageSize=-5"), OPTS).pageSize, 1);
  assert.equal(parseListParams(url("page=0"), OPTS).page, 1);
  assert.equal(parseListParams(url("page=abc"), OPTS).page, 1);
});

test("skip/take и произвольные фильтры", () => {
  const p = parseListParams(url("page=3&pageSize=25&projectId=p1&search=%20x%20"), OPTS);
  assert.equal(p.skip, 50);
  assert.equal(p.take, 25);
  assert.equal(p.get("projectId"), "p1");
  assert.equal(p.get("missing"), "");
  assert.equal(p.search, "x"); // trim
});

test("order принимает только asc/desc", () => {
  assert.equal(parseListParams(url("order=ASC"), OPTS).order, "desc"); // мусор → дефолт
  assert.equal(parseListParams(url("order=asc"), OPTS).order, "asc");
});
