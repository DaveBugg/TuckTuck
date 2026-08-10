import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { decryptSecret } from "@/lib/secret-crypto";
import { sendMessage } from "@/lib/telegram";
import { proxyForBot } from "@/lib/notify-proxy";
import { getSettings } from "@/lib/settings";
import { makeT } from "@/lib/i18n/translate";
import { tForRequest } from "@/lib/i18n/server";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Тестовое сообщение во все чаты бота. Проверяет ровно то, что ломается чаще
 * всего: верен ли токен и добавлен ли бот в чат с правом писать.
 */
export async function POST(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    await requirePermission("notify.manage");
    const { id } = await ctx.params;

    const bot = await prisma.notifyBot.findUnique({ where: { id }, include: { chats: true } });
    if (!bot) return NextResponse.json({ error: t("notify.err.botNotFound") }, { status: 404 });
    if (bot.chats.length === 0) {
      return NextResponse.json({ error: t("notify.err.noChats") }, { status: 400 });
    }

    const token = decryptSecret(bot.tokenEnc);
    const proxy = await proxyForBot(bot.proxyUrlEnc);
    // Тестовое сообщение уходит в чат, поэтому на языке оповещений, а не на
    // языке того, кто нажал кнопку в панели.
    const tBot = makeT((await getSettings()).notifyLocale);
    const results = [];
    for (const c of bot.chats) {
      const r = await sendMessage(
        token,
        c.chatId,
        tBot("notify.test.message"),
        undefined,
        proxy
      );
      results.push({ chatId: c.chatId, ok: r.ok, error: r.ok ? "" : r.error });
    }
    return NextResponse.json({ results });
  } catch (e) {
    return toApiError(e, t);
  }
}
