import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { encryptSecret, decryptSecret } from "@/lib/secret-crypto";
import { deleteWebhook, getMe, setWebhook } from "@/lib/telegram";
import { publicBaseUrl, webhookSecret } from "@/lib/notify-webhook";
import { KINDS } from "@/lib/resources";
import { maskProxyUrl, proxyForBot, validateProxyUrl } from "@/lib/notify-proxy";
import { parseChats } from "../route";
import { tForRequest } from "@/lib/i18n/server";
import type { TFunc } from "@/lib/i18n/translate";

type Ctx = { params: Promise<{ id: string }> };

const SELECT = {
  id: true,
  name: true,
  isActive: true,
  kinds: true,
  createdAt: true,
  proxyUrlEnc: true,
  chats: { select: { id: true, chatId: true, label: true, allowedUserIds: true } },
  tags: { select: { tag: { select: { id: true, name: true } } } },
} as const;

const shape = (b: any, t: TFunc) => {
  const { proxyUrlEnc, ...rest } = b;
  let proxy = "";
  try {
    proxy = proxyUrlEnc ? maskProxyUrl(decryptSecret(proxyUrlEnc)) : "";
  } catch {
    // Ключ шифрования сменили — расшифровать нечем. Показываем это словами, а
    // не пустотой: пустая строка выглядит как «прокси не задан», и человек
    // будет искать, почему бот не ходит через прокси, которого «нет».
    proxy = t("notify.proxy.unreadable");
  }
  return { ...rest, tags: b.tags.map((rt: any) => rt.tag), proxy };
};

export async function PATCH(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    await requirePermission("notify.manage");
    const { id } = await ctx.params;
    const b = await req.json().catch(() => ({}));

    const data: Record<string, unknown> = {};
    if (typeof b.name === "string") {
      const n = b.name.trim();
      if (!n) return NextResponse.json({ error: t("notify.err.nameRequired") }, { status: 400 });
      data.name = n;
    }
    if (typeof b.isActive === "boolean") data.isActive = b.isActive;
    if (Array.isArray(b.kinds)) data.kinds = b.kinds.filter((k: string) => KINDS.includes(k as any));

    // Прокси: пустая строка — осознанное «ходить напрямую», поэтому
    // отличаем «не прислали поле» от «прислали пустым».
    let proxy = "";
    if (typeof b.proxyUrl === "string") {
      const raw = b.proxyUrl.trim();
      const err = validateProxyUrl(raw, t);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      data.proxyUrlEnc = raw ? encryptSecret(raw) : "";
      proxy = raw;
    }
    if (!proxy) {
      const cur = await prisma.notifyBot.findUnique({
        where: { id },
        select: { proxyUrlEnc: true },
      });
      proxy = await proxyForBot(cur?.proxyUrlEnc ?? "");
    }

    // Токен меняем только если прислали непустой: форма не знает текущий и
    // присылает пустую строку, когда его не трогали.
    const candidate: string = typeof b.token === "string" ? b.token.trim() : "";
    const newToken: string | null = candidate || null;
    if (newToken) {
      const me = await getMe(newToken, proxy);
      if (!me.ok) {
        // Сетевой сбой и отказ API лечатся по-разному — не путаем их в тексте.
        return NextResponse.json(
          {
            error: me.network
              ? t("notify.err.unreachable", { error: me.error })
              : t("notify.err.tokenRejected", { error: me.error }),
          },
          { status: 400 }
        );
      }
      data.tokenEnc = encryptSecret(newToken);
    }

    const tagIds: string[] | null = Array.isArray(b.tagIds) ? b.tagIds.filter(Boolean) : null;
    const chats = Array.isArray(b.chats) ? parseChats(b.chats) : null;

    const row = await prisma.$transaction(async tx => {
      // Теги и чаты приходят полным набором, а не дельтой: форма всегда знает
      // итоговый список, и «стереть и записать» не оставляет расхождений.
      if (tagIds) {
        await tx.notifyBotTag.deleteMany({ where: { botId: id } });
        if (tagIds.length) {
          await tx.notifyBotTag.createMany({ data: tagIds.map(tagId => ({ botId: id, tagId })) });
        }
      }
      if (chats) {
        await tx.notifyBotChat.deleteMany({ where: { botId: id } });
        if (chats.length) {
          await tx.notifyBotChat.createMany({ data: chats.map(c => ({ botId: id, ...c })) });
        }
      }
      return tx.notifyBot.update({ where: { id }, data, select: SELECT });
    });

    // Токен сменили — вебхук привязан к нему, надо переставить.
    let webhook: string | undefined;
    const base = publicBaseUrl();
    if (newToken && base) {
      const r = await setWebhook(
        newToken,
        `${base}/api/notify/webhook/${id}`,
        webhookSecret(id),
        proxy
      );
      webhook = r.ok ? "ok" : t("notify.webhook.failed", { error: r.error });
    }

    return NextResponse.json({ row: shape(row, t), ...(webhook ? { webhook } : {}) });
  } catch (e) {
    return toApiError(e, t);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    await requirePermission("notify.manage");
    const { id } = await ctx.params;

    const bot = await prisma.notifyBot.findUnique({
      where: { id },
      select: { tokenEnc: true, proxyUrlEnc: true },
    });
    // Снимаем вебхук ДО удаления: иначе Телеграм продолжит стучаться на
    // несуществующего бота и копить ошибки на своей стороне. Не смогли —
    // не страшно, наш роут ответит 200 и проигнорирует.
    if (bot) {
      try {
        await deleteWebhook(decryptSecret(bot.tokenEnc), await proxyForBot(bot.proxyUrlEnc));
      } catch {
        /* токен мог быть нечитаем — удаляем всё равно */
      }
    }
    await prisma.notifyBot.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toApiError(e);
  }
}
