import type { TFunc } from "./i18n/translate";

export type ChatInput = {
  chatId: string;
  label: string;
  allowedMode: "all" | "project" | "users";
  allowedProjectId: string | null;
  allowedUserIds: string[];
};

function parseUserIds(raw: unknown): string[] {
  const ids = Array.isArray(raw)
    ? raw.map((v: unknown) => String(v).trim()).filter(Boolean)
    : [];
  return Array.from(new Set(ids));
}

export function parseChats(raw: unknown): ChatInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c: any): ChatInput => {
      const mode = String(c?.allowedMode || "users").trim();
      const allowedMode: ChatInput["allowedMode"] =
        mode === "all" || mode === "project" ? mode : "users";
      const allowedProjectId =
        typeof c?.allowedProjectId === "string" && c.allowedProjectId
          ? c.allowedProjectId
          : null;
      return {
        chatId: String(c?.chatId || "").trim(),
        label: String(c?.label || "").trim(),
        allowedMode,
        allowedProjectId,
        allowedUserIds: parseUserIds(c?.allowedUserIds),
      };
    })
    .filter(c => c.chatId);
}

export function validateChats(
  chats: ChatInput[],
  t: TFunc
): string | undefined {
  for (const c of chats) {
    if (c.allowedMode === "project") {
      if (!c.allowedProjectId) {
        return t("notify.err.projectIdRequired");
      }
    } else if (c.allowedMode === "users") {
      if (!c.allowedUserIds.length) {
        return t("notify.err.allowedUsersRequired");
      }
    }
  }
  return undefined;
}
