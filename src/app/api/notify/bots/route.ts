import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { encryptSecret, decryptSecret } from "@/lib/secret-crypto";
import { getMe, setWebhook } from "@/lib/telegram";
import { publicBaseUrl, webhookSecret } from "@/lib/notify-webhook";
import { KINDS } from "@/lib/resources";
import { maskProxyUrl, proxyForBot, validateProxyUrl } from "@/lib/notify-proxy";
import { encryptSecret as enc } from "@/lib/secret-crypto";
import { tForRequest } from "@/lib/i18n/server";
import type { TFunc } from "@/lib/i18n/translate";

/** Токен наружу не отдаём никогда — только признак, что он задан. */
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

// Адрес прокси наружу отдаём ТОЛЬКО замаскированным: в нём пароль.
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

/**
 * Чаты бота из тела запроса.
 *
 * allowedUserIds — кому в этом чате можно нажимать кнопки под напоминаниями.
 * Пустой список = всем, кто в чате: для личного чата 1:1 это ты сам. Для
 * группы список надо заполнить, иначе удалить ресурс сможет любой участник.
 */
export type ChatInput = { chatId: string; label: string; allowedUserIds: string[] };

export function parseChats(raw: unknown): ChatInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c: any): ChatInput => {
      const ids: string[] = Array.isArray(c?.allowedUserIds)
        ? c.allowedUserIds.map((v: unknown) => String(v).trim()).filter(Boolean)
        : [];
      return {
        chatId: String(c?.chatId || "").trim(),
        label: String(c?.label || "").trim(),
        allowedUserIds: Array.from(new Set(ids)),
      };
    })
    .filter(c => c.chatId);
}

export async function GET(req: Request) {
  const t = tForRequest(req);
  try {
    await requirePermission("notify.manage");
    const rows = await prisma.notifyBot.findMany({ orderBy: { createdAt: "asc" }, select: SELECT });
    return NextResponse.json({ rows: rows.map(r => shape(r, t)), webhookBase: publicBaseUrl() });
  } catch (e) {
    return toApiError(e, t);
  }
}

export async function POST(req: Request) {
  const t = tForRequest(req);
  try {
    await requirePermission("notify.manage");
    const b = await req.json().catch(() => ({}));

    const name = typeof b.name === "string" ? b.name.trim() : "";
    const token = typeof b.token === "string" ? b.token.trim() : "";
    if (!name) return NextResponse.json({ error: t("notify.err.nameRequired") }, { status: 400 });
    if (!token) return NextResponse.json({ error: t("notify.err.tokenRequired") }, { status: 400 });

    // Проверяем токен ДО сохранения: иначе бот молча не работал бы, а понять
    // это можно было бы только по отсутствию сообщений.
    const proxyRaw = typeof b.proxyUrl === "string" ? b.proxyUrl.trim() : "";
    const proxyErr = validateProxyUrl(proxyRaw, t);
    if (proxyErr) return NextResponse.json({ error: proxyErr }, { status: 400 });
    // Прокси для проверки берём тот же, что будет у бота потом: иначе
    // getMe прошёл бы напрямую, а рассылка пошла через прокси (или наоборот).
    const proxy = proxyRaw || (await proxyForBot(""));

    const me = await getMe(token, proxy);
    if (!me.ok) {
      // Сетевой сбой и отказ API — разные беды с разным лечением. Раньше здесь
      // и то и другое показывалось как «Телеграм не принял токен», и человек
      // шёл проверять заведомо верный токен вместо того, чтобы смотреть сеть.
      return NextResponse.json(
        {
          error: me.network
            ? t("notify.err.unreachable", { error: me.error })
            : t("notify.err.tokenRejected", { error: me.error }),
        },
        { status: 400 }
      );
    }

    const kinds = Array.isArray(b.kinds) ? b.kinds.filter((k: string) => KINDS.includes(k as any)) : [];
    const tagIds: string[] = Array.isArray(b.tagIds) ? b.tagIds.filter(Boolean) : [];
    const chats = parseChats(b.chats);

    const row = await prisma.notifyBot.create({
      data: {
        name,
        tokenEnc: encryptSecret(token),
        kinds,
        proxyUrlEnc: proxyRaw ? enc(proxyRaw) : "",
        chats: { create: chats },
        tags: { create: tagIds.map(tagId => ({ tagId })) },
      },
      select: SELECT,
    });

    // Вебхук ставим сразу — без него кнопки под сообщениями не работают.
    // Не смогли (нет публичного адреса) — бот всё равно создан и шлёт
    // напоминания, просто без кнопок; об этом сообщаем ответом.
    const base = publicBaseUrl();
    let webhook = t("notify.webhook.noPublicUrl");
    if (base) {
      const r = await setWebhook(
        token,
        `${base}/api/notify/webhook/${row.id}`,
        webhookSecret(row.id),
        proxy
      );
      webhook = r.ok ? "ok" : t("notify.webhook.failed", { error: r.error });
    }

    return NextResponse.json({ row: shape(row, t), username: me.result.username, webhook }, { status: 201 });
  } catch (e) {
    return toApiError(e, t);
  }
}
