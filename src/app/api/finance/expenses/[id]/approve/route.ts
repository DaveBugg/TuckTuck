import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";
import { writeAudit } from "@/lib/finance-audit";
import { canTransitionStatus } from "@/lib/finance";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("finance.approve");
    const { id } = await ctx.params;

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }
    if (existing.createdById === me.id) {
      return NextResponse.json(
        { error: t("finance.err.cannotApproveOwn") },
        { status: 403 }
      );
    }
    if (!canTransitionStatus(existing.status, "APPROVED")) {
      return NextResponse.json(
        { error: t("finance.err.cannotTransition") },
        { status: 400 }
      );
    }

    const row = await prisma.expense.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: me.id,
        approvedAt: new Date(),
      },
    });

    await writeAudit(me.id, "APPROVE", "expense", id, existing, row);

    return NextResponse.json({
      row: {
        ...row,
        amount: row.amount.toString(),
        amountBase: row.amountBase.toString(),
      },
    });
  } catch (e) {
    return toApiError(e, t);
  }
}
