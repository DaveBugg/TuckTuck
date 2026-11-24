// Чистая часть аудита: сериализация снимков (Decimal → строка, Date → ISO).
import test from "node:test";
import assert from "node:assert/strict";
import { serializeSnapshot } from "../../src/lib/finance-audit";

test("serializeSnapshot: обычные поля проходят как есть", () => {
  const out = serializeSnapshot({ a: 1, b: "x", c: true });
  assert.deepEqual(out, { a: 1, b: "x", c: true });
});

test("serializeSnapshot: Decimal-like → строка", () => {
  const out = serializeSnapshot({
    amount: { toString: () => "123.45", constructor: { name: "Decimal" } },
  });
  assert.equal((out as any).amount, "123.45");
});

test("serializeSnapshot: Date → ISO-строка", () => {
  const d = new Date("2026-08-15T12:00:00Z");
  const out = serializeSnapshot({ at: d });
  assert.equal((out as any).at, d.toISOString());
});

test("serializeSnapshot: массивы обрабатываются рекурсивно", () => {
  const out = serializeSnapshot([
    { amount: { toString: () => "10", constructor: { name: "Decimal" } } },
    { amount: { toString: () => "20", constructor: { name: "Decimal" } } },
  ]);
  assert.deepEqual(out, [{ amount: "10" }, { amount: "20" }]);
});

test("serializeSnapshot: null/undefined сохраняются", () => {
  assert.equal(serializeSnapshot(null), null);
  assert.equal(serializeSnapshot(undefined), undefined);
});

test("serializeSnapshot: bigint → строка", () => {
  const out = serializeSnapshot({ id: BigInt("12345678901234567890") });
  assert.equal((out as any).id, "12345678901234567890");
});
