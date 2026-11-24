import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("finance.admin");
    const { id } = await ctx.params;
    const b = await req.json().catch(() => ({}));
    const active = b.active === true;

    const row = await prisma.telegramApprovedGroup.update({
      where: { id },
      data: { active, approvedById: active ? me.id : null },
      select: {
        id: true,
        chatId: true,
        title: true,
        active: true,
        approvedById: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ...row,
      chatId: String(row.chatId),
      createdAt: row.createdAt.toISOString(),
    });
  } catch (e) {
    return toApiError(e, t);
  }
}
