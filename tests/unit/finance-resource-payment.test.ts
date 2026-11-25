import assert from "node:assert";
import { describe, it } from "node:test";
import { buildExpenseFromPayment } from "@/lib/finance-service";
import { makeT } from "@/lib/i18n/translate";

describe("buildExpenseFromPayment", () => {
  const t = makeT("en");
  const perUsd = { USD: 1, EUR: 1.1 };
  const resource = { id: "r1", name: "Hetzner", projectId: "p1" };
  const paidAt = new Date("2026-11-25T00:00:00Z");

  it("creates expense input for a linked resource", () => {
    const prep = buildExpenseFromPayment({
      resource,
      payment: { amount: 10, currency: "USD", paidAt },
      displayCurrency: "USD",
      perUsd,
      t,
    });
    assert.ok(!("error" in prep));
    assert.equal(prep.kind, "EXPENSE");
    assert.equal(prep.scope, "PROJECT");
    assert.equal(prep.projectId, "p1");
    assert.equal(prep.amountBase, "10.00000000");
    assert.equal(prep.title, "Payment: Hetzner");
    assert.equal(prep.resourceId, "r1");
    assert.deepStrictEqual(prep.tags, []);
  });

  it("converts amount to display currency", () => {
    const prep = buildExpenseFromPayment({
      resource,
      payment: { amount: 11, currency: "EUR", paidAt },
      displayCurrency: "USD",
      perUsd,
      t,
    });
    assert.ok(!("error" in prep));
    assert.equal(prep.amountBase, "10.00000000");
  });

  it("returns error when resource is not linked to a project", () => {
    const prep = buildExpenseFromPayment({
      resource: { ...resource, projectId: null },
      payment: { amount: 10, currency: "USD", paidAt },
      displayCurrency: "USD",
      perUsd,
      t,
    });
    assert.ok("error" in prep);
  });

  it("returns error when rate is missing", () => {
    const prep = buildExpenseFromPayment({
      resource,
      payment: { amount: 10, currency: "GBP", paidAt },
      displayCurrency: "USD",
      perUsd,
      t,
    });
    assert.ok("error" in prep);
  });
});
