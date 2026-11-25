import assert from "node:assert";
import { describe, it } from "node:test";
import {
  parseAmountText,
  normalizeCurrency,
  splitTitleDescription,
  buildCurrencyKeyboard,
  buildTagsKeyboard,
  buildProjectKeyboard,
  buildMemberKeyboard,
  buildConfirmKeyboard,
  decideApprovalTarget,
  isFinanceCallback,
  decideFlowAction,
} from "@/lib/tg-bot-fsm";

describe("tg-bot-flow", () => {
  describe("parseAmountText", () => {
    it("parses plain integer", () => {
      assert.strictEqual(parseAmountText("4200"), 4200);
    });

    it("parses space-separated thousands with comma decimal", () => {
      assert.strictEqual(parseAmountText("4 200,50"), 4200.5);
    });

    it("parses dot decimal", () => {
      assert.strictEqual(parseAmountText("1234.56"), 1234.56);
    });

    it("rejects negative", () => {
      assert.strictEqual(parseAmountText("-10"), null);
    });

    it("rejects garbage", () => {
      assert.strictEqual(parseAmountText("abc"), null);
    });
  });

  describe("normalizeCurrency", () => {
    it("uppercases valid code", () => {
      assert.strictEqual(normalizeCurrency("usd"), "USD");
    });

    it("rejects too short", () => {
      assert.strictEqual(normalizeCurrency("U"), null);
    });

    it("rejects invalid characters", () => {
      assert.strictEqual(normalizeCurrency("US1"), null);
    });
  });

  describe("splitTitleDescription", () => {
    it("splits title and description", () => {
      const result = splitTitleDescription("Server — Hetzner invoice");
      assert.strictEqual(result.title, "Server");
      assert.strictEqual(result.description, "Hetzner invoice");
    });

    it("keeps whole text as title when no separator", () => {
      const result = splitTitleDescription("Coffee");
      assert.strictEqual(result.title, "Coffee");
      assert.strictEqual(result.description, "");
    });
  });

  describe("buildCurrencyKeyboard", () => {
    it("lays currencies 3 per row and adds Other", () => {
      const kb = buildCurrencyKeyboard(["USD", "EUR", "RUB", "USDT"], "Other");
      assert.strictEqual(kb.length, 3); // 3 + 3 + 1? No: 4 currencies -> 2 rows (3+1) + Other
      assert.strictEqual(kb[0].length, 3);
      assert.strictEqual(kb[1].length, 1);
      assert.strictEqual(kb[2].length, 1);
      assert.strictEqual(kb[2][0].callback_data, "fincuro");
    });
  });

  describe("buildTagsKeyboard", () => {
    it("marks selected tags and provides done/skip", () => {
      const kb = buildTagsKeyboard(
        ["a", "b", "c"],
        new Set(["a"]),
        "Done",
        "Skip"
      );
      const firstRow = kb[0];
      assert.strictEqual(firstRow[0].text, "✅ a");
      assert.strictEqual(firstRow[1].text, "b");
      const lastRow = kb[kb.length - 1];
      assert.strictEqual(lastRow[0].callback_data, "fintags-skip");
      assert.strictEqual(lastRow[1].callback_data, "fintags-done");
    });
  });

  describe("buildProjectKeyboard", () => {
    it("paginates projects by 8 and adds navigation", () => {
      const projects = Array.from({ length: 10 }, (_, i) => ({
        id: `p${i}`,
        name: `Project ${i}`,
      }));
      const kb = buildProjectKeyboard(projects, 0);
      assert.strictEqual(kb.length, 9); // 8 items + nav
      assert.strictEqual(kb[0][0].callback_data, "finpr:p0");
      const nav = kb[kb.length - 1];
      assert.ok(nav.some(b => b.callback_data === "finprp:1"));
    });
  });

  describe("decideApprovalTarget", () => {
    it("routes to source group when sourceChatId exists", () => {
      const target = decideApprovalTarget({
        sourceChatId: "-100123",
        sourceMessageId: 7,
      });
      assert.ok("chatId" in target);
      assert.strictEqual(target.chatId, "-100123");
      assert.strictEqual(target.messageId, 7);
    });

    it("routes to DM when no sourceChatId", () => {
      const target = decideApprovalTarget({
        sourceChatId: "",
        sourceMessageId: null,
      });
      assert.ok("dm" in target);
      assert.strictEqual(target.dm, true);
    });
  });

  describe("isFinanceCallback", () => {
    it("accepts finance namespace callbacks", () => {
      assert.ok(isFinanceCallback("fincr:USD"));
      assert.ok(isFinanceCallback("finsc:PROJECT"));
      assert.ok(isFinanceCallback("finpr:p1"));
      assert.ok(isFinanceCallback("finprp:1"));
      assert.ok(isFinanceCallback("finme:m1"));
      assert.ok(isFinanceCallback("finmep:0"));
      assert.ok(isFinanceCallback("finta:server"));
      assert.ok(isFinanceCallback("fintags-done"));
      assert.ok(isFinanceCallback("finconfirm"));
      assert.ok(isFinanceCallback("fintg-cancel"));
      assert.ok(isFinanceCallback("fina:exp1"));
      assert.ok(isFinanceCallback("finr:exp1"));
      assert.ok(isFinanceCallback("finmenu-expense"));
      assert.ok(isFinanceCallback("finmenu-balance"));
    });

    it("rejects old generic prefixes", () => {
      assert.ok(!isFinanceCallback("proj:p1"));
      assert.ok(!isFinanceCallback("projp:1"));
      assert.ok(!isFinanceCallback("mem:m1"));
      assert.ok(!isFinanceCallback("tag:server"));
      assert.ok(!isFinanceCallback("confirm"));
      assert.ok(!isFinanceCallback("tg-cancel"));
      assert.ok(!isFinanceCallback("menu-expense"));
    });

    it("rejects unrelated reminders", () => {
      assert.ok(!isFinanceCallback("paid:msg1"));
      assert.ok(!isFinanceCallback("cancel:msg1"));
    });
  });

  describe("buildMemberKeyboard", () => {
    it("uses finme namespace", () => {
      const kb = buildMemberKeyboard([{ id: "m1", name: "Member 1" }], 0);
      assert.strictEqual(kb[0][0].callback_data, "finme:m1");
    });
  });

  describe("buildConfirmKeyboard", () => {
    it("uses finconfirm and fintg-cancel", () => {
      const kb = buildConfirmKeyboard("Send", "Cancel");
      assert.strictEqual(kb[0][0].callback_data, "finconfirm");
      assert.strictEqual(kb[1][0].callback_data, "fintg-cancel");
    });
  });

  describe("decideFlowAction", () => {
    it("edits the menu message when starting from a callback", () => {
      const plan = decideFlowAction(undefined, 42);
      assert.strictEqual(plan.type, "edit");
      assert.strictEqual(plan.messageId, 42);
    });

    it("edits the existing flow message when id is known", () => {
      const plan = decideFlowAction(7);
      assert.strictEqual(plan.type, "edit");
      assert.strictEqual(plan.messageId, 7);
    });

    it("sends a new message when no flow id exists", () => {
      const plan = decideFlowAction(undefined);
      assert.strictEqual(plan.type, "send");
    });
  });
});
