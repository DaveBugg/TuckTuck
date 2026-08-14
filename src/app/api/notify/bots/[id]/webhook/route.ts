import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { decryptSecret } from "@/lib/secret-crypto";
import { getWebhookInfo, setWebhook } from "@/lib/telegram";
import { publicBaseUrl, webhookSecret } from "@/lib/notify-webhook";
import { proxyForBot } from "@/lib/notify-proxy";
import { tForRequest } from "@/lib/i18n/server";

/**
 * Состояние вебхука бота и его переустановка.
 *
 * Без этого «кнопка под сообщением не реагирует» не диагностируется вовсе: с
 * нашей стороны при неработающем вебхуке ровно тишина — запросов нет, ошибок
 * нет, логов нет. Правду знает только Телеграм: какой адрес у него записан,
 * сколько обновлений скопилось и что именно у него не получается при доставке.
 *
 * Вебхук ставится при заведении бота, но между «поставили» и «сейчас» многое
 * могло случиться: адрес панели поменялся, сертификат протух, бот заводился,
 * когда Телеграм был недоступен и setWebhook не прошёл.
 */
type Ctx = { params: Promise<{ id: string }> };

async function botOr404(id: string) {
  return prisma.notifyBot.findUnique({
    where: { id },
    select: { id: true, name: true, tokenEnc: true, proxyUrlEnc: true },
  });
}

export async function GET(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    await requirePermission("notify.manage");
    const { id } = await ctx.params;
    const bot = await botOr404(id);
    if (!bot) return NextResponse.json({ error: t("err.notFound") }, { status: 404 });

    const base = publicBaseUrl();
    const expected = base ? `${base}/api/notify/webhook/${bot.id}` : "";

    let token: string;
    try {
      token = decryptSecret(bot.tokenEnc);
    } catch {
      return NextResponse.json({ error: t("notify.err.tokenUnreadable") }, { status: 400 });
    }

    const info = await getWebhookInfo(token, await proxyForBot(bot.proxyUrlEnc));
    if (!info.ok) {
      return NextResponse.json({ expected, reachable: false, error: info.error });
    }

    return NextResponse.json({
      expected,
      reachable: true,
      url: info.result.url,
      // Совпадение адреса — главное, на что смотрят: бот, заведённый до смены
      // домена, продолжает слать обновления в никуда.
      matches: !!expected && info.result.url === expected,
      pending: info.result.pending_update_count,
      lastErrorAt: info.result.last_error_date
        ? new Date(info.result.last_error_date * 1000).toISOString()
        : null,
      lastError: info.result.last_error_message || "",
    });
  } catch (e) {
    return toApiError(e, t);
  }
}

/** Переустановить вебхук на текущий адрес панели. */
export async function POST(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    await requirePermission("notify.manage");
    const { id } = await ctx.params;
    const bot = await botOr404(id);
    if (!bot) return NextResponse.json({ error: t("err.notFound") }, { status: 404 });

    const base = publicBaseUrl();
    if (!base) {
      return NextResponse.json({ error: t("notify.webhook.noPublicUrl") }, { status: 400 });
    }

    let token: string;
    try {
      token = decryptSecret(bot.tokenEnc);
    } catch {
      return NextResponse.json({ error: t("notify.err.tokenUnreadable") }, { status: 400 });
    }

    const r = await setWebhook(
      token,
      `${base}/api/notify/webhook/${bot.id}`,
      webhookSecret(bot.id),
      await proxyForBot(bot.proxyUrlEnc)
    );
    if (!r.ok) {
      return NextResponse.json(
        { error: t("notify.webhook.failed", { error: r.error }) },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, url: `${base}/api/notify/webhook/${bot.id}` });
  } catch (e) {
    return toApiError(e, t);
  }
}
