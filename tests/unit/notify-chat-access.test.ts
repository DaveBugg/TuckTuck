import assert from "node:assert";
import { describe, it } from "node:test";
import {
  canPressButtonsDecision,
  isAllowedMode,
} from "@/lib/notify-chat-access";

function chat(
  mode: string,
  extra: { allowedProjectId?: string; allowedUserIds?: string[] } = {}
) {
  return {
    allowedMode: mode,
    allowedProjectId: extra.allowedProjectId ?? null,
    allowedUserIds: extra.allowedUserIds ?? [],
  };
}

describe("notify-chat-access", () => {
  describe("isAllowedMode", () => {
    it("accepts known modes", () => {
      assert.strictEqual(isAllowedMode("all"), true);
      assert.strictEqual(isAllowedMode("project"), true);
      assert.strictEqual(isAllowedMode("users"), true);
    });

    it("rejects unknown modes", () => {
      assert.strictEqual(isAllowedMode("everyone"), false);
      assert.strictEqual(isAllowedMode(""), false);
      assert.strictEqual(isAllowedMode(null), false);
      assert.strictEqual(isAllowedMode(42), false);
    });
  });

  describe("canPressButtonsDecision", () => {
    it("mode all allows everyone", () => {
      assert.strictEqual(
        canPressButtonsDecision(chat("all"), 12345, new Set()),
        true
      );
    });

    it("mode users allows listed ids only", () => {
      const c = chat("users", { allowedUserIds: ["111", "222"] });
      assert.strictEqual(canPressButtonsDecision(c, 111, new Set()), true);
      assert.strictEqual(canPressButtonsDecision(c, "222", new Set()), true);
      assert.strictEqual(canPressButtonsDecision(c, 333, new Set()), false);
    });

    it("mode users with empty list rejects everyone", () => {
      const c = chat("users", { allowedUserIds: [] });
      assert.strictEqual(canPressButtonsDecision(c, 111, new Set()), false);
    });

    it("mode project allows project member telegram ids", () => {
      const c = chat("project", { allowedProjectId: "proj-1" });
      const projectIds = new Set(["111", "222"]);
      assert.strictEqual(canPressButtonsDecision(c, 111, projectIds), true);
      assert.strictEqual(canPressButtonsDecision(c, 333, projectIds), false);
    });

    it("mode project without project id rejects everyone", () => {
      const c = chat("project");
      assert.strictEqual(
        canPressButtonsDecision(c, 111, new Set(["111"])),
        false
      );
    });

    it("falls back to users mode for unknown mode", () => {
      const c = chat("unknown", { allowedUserIds: ["42"] });
      assert.strictEqual(canPressButtonsDecision(c, 42, new Set()), true);
      assert.strictEqual(canPressButtonsDecision(c, 43, new Set()), false);
    });

    it("handles bigint telegram ids", () => {
      const c = chat("users", { allowedUserIds: ["123456789012345"] });
      assert.strictEqual(
        canPressButtonsDecision(c, BigInt("123456789012345"), new Set()),
        true
      );
    });
  });
});
