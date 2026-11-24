import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";
import { writeAudit } from "@/lib/finance-audit";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("finance.manage");
    const { id } = await ctx.params;
    const b = await req.json().catch(() => ({}));

    const existing = await prisma.teamMember.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (b.name !== undefined) {
      const name = typeof b.name === "string" ? b.name.trim() : "";
      if (!name)
        return NextResponse.json(
          { error: t("finance.err.titleRequired") },
          { status: 400 }
        );
      data.name = name;
    }
    if (b.position !== undefined) {
      data.position = typeof b.position === "string" ? b.position.trim() : "";
    }
    if (typeof b.active === "boolean") data.active = b.active;

    const row = await prisma.teamMember.update({ where: { id }, data });
    await writeAudit(me.id, "UPDATE", "member", id, existing, row);

    return NextResponse.json({ row });
  } catch (e) {
    return toApiError(e, t);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("finance.manage");
    const { id } = await ctx.params;

    const existing = await prisma.teamMember.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }

    const row = await prisma.teamMember.update({
      where: { id },
      data: { active: false },
    });
    await writeAudit(me.id, "UPDATE", "member", id, existing, {
      ...existing,
      active: false,
    });

    return NextResponse.json({ row });
  } catch (e) {
    return toApiError(e, t);
  }
}
