import { prisma } from "./prisma";

type ChatWithAccess = {
  allowedMode: string;
  allowedProjectId: string | null;
  allowedUserIds: string[];
};

const MODES = ["all", "project", "users"] as const;
type Mode = (typeof MODES)[number];

export function isAllowedMode(v: unknown): v is Mode {
  return typeof v === "string" && (MODES as readonly string[]).includes(v);
}

/**
 * Чистая часть проверки: по данным чата и набору telegram user id участников
 * проекта (для режима project) решает, может ли пользователь жать кнопки.
 */
export function canPressButtonsDecision(
  chat: ChatWithAccess,
  tgUserId: number | string | bigint,
  projectMemberTgIds: Set<string>
): boolean {
  const mode = isAllowedMode(chat.allowedMode) ? chat.allowedMode : "users";
  const who = String(tgUserId);

  if (mode === "all") return true;
  if (mode === "project") {
    if (!chat.allowedProjectId) return false;
    return projectMemberTgIds.has(who);
  }
  return chat.allowedUserIds.includes(who);
}

/**
 * Может ли пользователь Telegram нажимать кнопки бота в этом чате.
 *
 * Режимы:
 *   all     — любой участник чата;
 *   project — пользователи, привязанные к участникам выбранного проекта;
 *   users   — только перечисленные telegram user id.
 */
export async function canPressButtons(
  chat: ChatWithAccess,
  tgUserId: number | string | bigint
): Promise<boolean> {
  const mode = isAllowedMode(chat.allowedMode) ? chat.allowedMode : "users";
  if (mode === "all") return true;

  const who = String(tgUserId);
  if (mode === "users") return chat.allowedUserIds.includes(who);

  if (!chat.allowedProjectId) return false;
  const members = await prisma.projectMember.findMany({
    where: { projectId: chat.allowedProjectId },
    select: {
      member: {
        select: { user: { select: { telegramUserId: true } } },
      },
    },
  });
  const ids = new Set(
    members
      .map(m => m.member.user?.telegramUserId)
      .filter((id): id is bigint => id != null)
      .map(String)
  );
  return ids.has(who);
}
