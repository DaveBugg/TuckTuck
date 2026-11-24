import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";
import { writeAudit } from "@/lib/finance-audit";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    await requirePermission("finance.view");
    const { id } = await ctx.params;

    const row = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        archived: true,
        createdAt: true,
        updatedAt: true,
        members: {
          select: {
            percent: true,
            member: { select: { id: true, name: true, active: true } },
          },
        },
      },
    });
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      row: {
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        members: row.members.map(m => ({
          memberId: m.member.id,
          name: m.member.name,
          active: m.member.active,
          percent: m.percent?.toString() ?? null,
        })),
      },
    });
  } catch (e) {
    return toApiError(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("finance.manage");
    const { id } = await ctx.params;
    const b = await req.json().catch(() => ({}));

    const existing = await prisma.project.findUnique({ where: { id } });
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
    if (b.description !== undefined) {
      data.description =
        typeof b.description === "string" ? b.description.trim() : "";
    }
    if (typeof b.archived === "boolean") data.archived = b.archived;

    const row = await prisma.project.update({ where: { id }, data });
    await writeAudit(me.id, "UPDATE", "project", id, existing, row);

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

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }

    const row = await prisma.project.update({
      where: { id },
      data: { archived: true },
    });
    await writeAudit(me.id, "UPDATE", "project", id, existing, {
      ...existing,
      archived: true,
    });

    return NextResponse.json({ row });
  } catch (e) {
    return toApiError(e, t);
  }
}
