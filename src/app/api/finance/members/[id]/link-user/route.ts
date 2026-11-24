import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";
import { writeAudit } from "@/lib/finance-audit";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("finance.admin");
    const { id } = await ctx.params;
    const b = await req.json().catch(() => ({}));
    const userId = b.userId === null || b.userId === "" ? null : b.userId;

    const member = await prisma.teamMember.findUnique({ where: { id } });
    if (!member) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }

    if (userId) {
      const existing = await prisma.teamMember.findFirst({
        where: { userId, NOT: { id } },
      });
      if (existing) {
        return NextResponse.json(
          { error: t("finance.err.userAlreadyLinked") },
          { status: 409 }
        );
      }
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return NextResponse.json(
          { error: t("err.relationNotFound") },
          { status: 400 }
        );
      }
    }

    const row = await prisma.teamMember.update({
      where: { id },
      data: { userId },
    });
    await writeAudit(me.id, "UPDATE", "member", id, member, row);

    return NextResponse.json({ row });
  } catch (e) {
    return toApiError(e, t);
  }
}
