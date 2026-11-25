import assert from "node:assert";
import { describe, it } from "node:test";
import { parseChats, validateChats } from "@/lib/notify-chat-input";

const t = (key: string) => key;

describe("notify-chat-input", () => {
  describe("parseChats", () => {
    it("returns empty array for non-array input", () => {
      assert.deepStrictEqual(parseChats(undefined), []);
      assert.deepStrictEqual(parseChats({}), []);
      assert.deepStrictEqual(parseChats("x"), []);
    });

    it("parses a chat with default users mode", () => {
      const chats = parseChats([
        { chatId: "123", label: "me", allowedUserIds: ["1", "2"] },
      ]);
      assert.strictEqual(chats.length, 1);
      assert.deepStrictEqual(chats[0], {
        chatId: "123",
        label: "me",
        allowedMode: "users",
        allowedProjectId: null,
        allowedUserIds: ["1", "2"],
      });
    });

    it("parses all mode", () => {
      const chats = parseChats([{ chatId: "-1", allowedMode: "all" }]);
      assert.strictEqual(chats[0].allowedMode, "all");
      assert.deepStrictEqual(chats[0].allowedUserIds, []);
    });

    it("parses project mode", () => {
      const chats = parseChats([
        {
          chatId: "-100",
          allowedMode: "project",
          allowedProjectId: "proj-1",
        },
      ]);
      assert.strictEqual(chats[0].allowedMode, "project");
      assert.strictEqual(chats[0].allowedProjectId, "proj-1");
    });

    it("falls back unknown mode to users", () => {
      const chats = parseChats([
        { chatId: "1", allowedMode: "everyone", allowedUserIds: ["42"] },
      ]);
      assert.strictEqual(chats[0].allowedMode, "users");
    });

    it("trims and deduplicates user ids", () => {
      const chats = parseChats([
        { chatId: "1", allowedUserIds: [" 1 ", "1", " 2 "] },
      ]);
      assert.deepStrictEqual(chats[0].allowedUserIds, ["1", "2"]);
    });

    it("skips chats without chatId", () => {
      const chats = parseChats([
        { chatId: "", allowedUserIds: ["1"] },
        { chatId: "valid", allowedUserIds: ["2"] },
      ]);
      assert.strictEqual(chats.length, 1);
      assert.strictEqual(chats[0].chatId, "valid");
    });
  });

  describe("validateChats", () => {
    it("allows all mode without extra data", () => {
      assert.strictEqual(
        validateChats(
          [
            {
              chatId: "1",
              label: "",
              allowedMode: "all",
              allowedProjectId: null,
              allowedUserIds: [],
            },
          ],
          t
        ),
        undefined
      );
    });

    it("rejects project mode without project id", () => {
      const err = validateChats(
        [
          {
            chatId: "1",
            label: "",
            allowedMode: "project",
            allowedProjectId: null,
            allowedUserIds: [],
          },
        ],
        t
      );
      assert.strictEqual(err, "notify.err.projectIdRequired");
    });

    it("rejects users mode without users", () => {
      const err = validateChats(
        [
          {
            chatId: "1",
            label: "",
            allowedMode: "users",
            allowedProjectId: null,
            allowedUserIds: [],
          },
        ],
        t
      );
      assert.strictEqual(err, "notify.err.allowedUsersRequired");
    });

    it("allows users mode with users", () => {
      assert.strictEqual(
        validateChats(
          [
            {
              chatId: "1",
              label: "",
              allowedMode: "users",
              allowedProjectId: null,
              allowedUserIds: ["42"],
            },
          ],
          t
        ),
        undefined
      );
    });
  });
});
