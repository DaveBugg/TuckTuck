import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/secret-crypto";
import { getMe } from "@/lib/telegram";
import { proxyForBot } from "@/lib/notify-proxy";
import { tForRequest } from "@/lib/i18n/server";
import { toApiError } from "@/lib/list-query";

function generateCode(): string {
  return crypto.randomBytes(8).toString("hex");
}

async function activeBotUsername(): Promise<string | null> {
  const bot = await prisma.notifyBot.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!bot) return null;
  let token: string;
  try {
    token = decryptSecret(bot.tokenEnc);
  } catch {
    return null;
  }
  const r = await getMe(token, await proxyForBot(bot.proxyUrlEnc));
  return r.ok ? r.result.username : null;
}

/**
 * GET — статус привязки Telegram текущего пользователя.
 */
export async function GET(req: Request) {
  const t = tForRequest(req);
  try {
    const me = await requireUser();
    const linked =
      me.telegramUserId !== null && me.telegramUserId !== undefined;
    return NextResponse.json({
      linked,
      userId: linked ? String(me.telegramUserId) : null,
    });
  } catch (e) {
    return toApiError(e, t);
  }
}

/**
 * POST — сгенерировать одноразовый код привязки и вернуть ссылку t.me/...?start=...
 */
export async function POST(req: Request) {
  const t = tForRequest(req);
  try {
    const me = await requireUser();
    const username = await activeBotUsername();
    if (!username) {
      return NextResponse.json(
        { error: t("finance.bot.noBot") },
        { status: 400 }
      );
    }

    let code = generateCode();
    // Защита от коллизии уникального кода: маловероятна, но обработаем честно.
    for (let i = 0; i < 5; i++) {
      try {
        await prisma.user.update({
          where: { id: me.id },
          data: { telegramLinkCode: code },
        });
        break;
      } catch (e: any) {
        if (e?.code === "P2002") {
          code = generateCode();
          continue;
        }
        throw e;
      }
    }

    return NextResponse.json({
      url: `https://t.me/${username}?start=${code}`,
    });
  } catch (e) {
    return toApiError(e, t);
  }
}

/**
 * DELETE — отвязать Telegram от учётной записи.
 */
export async function DELETE(req: Request) {
  const t = tForRequest(req);
  try {
    const me = await requireUser();
    await prisma.user.update({
      where: { id: me.id },
      data: { telegramUserId: null, telegramLinkCode: null },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toApiError(e, t);
  }
}
