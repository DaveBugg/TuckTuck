import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { visibilityWhere } from "@/lib/resources";
import { tForRequest } from "@/lib/i18n/server";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Выдать (или перевыпустить) токен агента мониторинга.
 *
 * Токен возвращается ОДИН раз — в момент выпуска, вместе с командой установки.
 * В списках и в карточке отдаётся только признак «агент подключён»: токен даёт
 * право писать метрики, и держать его в каждом ответе API незачем.
 *
 * Перевыпуск — он же отзыв: старый токен перестаёт работать сразу, потому что
 * поле перезаписывается.
 */
export async function POST(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("resources.manage");
    const { id } = await ctx.params;

    const found = await prisma.resource.findFirst({
      where: { id, ...visibilityWhere(me) },
      select: { id: true },
    });
    if (!found) return NextResponse.json({ error: t("err.notFound") }, { status: 404 });

    const token = crypto.randomBytes(24).toString("hex");
    await prisma.resource.update({ where: { id }, data: { agentToken: token } });

    return NextResponse.json({ token });
  } catch (e) {
    return toApiError(e, t);
  }
}

/** Отключить агент: метрики перестают приниматься. История снимков остаётся. */
export async function DELETE(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("resources.manage");
    const { id } = await ctx.params;

    const found = await prisma.resource.findFirst({
      where: { id, ...visibilityWhere(me) },
      select: { id: true },
    });
    if (!found) return NextResponse.json({ error: t("err.notFound") }, { status: 404 });

    await prisma.resource.update({ where: { id }, data: { agentToken: "" } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toApiError(e, t);
  }
}
