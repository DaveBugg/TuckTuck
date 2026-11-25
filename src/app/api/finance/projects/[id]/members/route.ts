import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";
import { writeAudit } from "@/lib/finance-audit";

type Ctx = { params: Promise<{ id: string }> };

type MemberInput = { memberId: string; percent?: number | null };

function parseBody(b: any): MemberInput[] | { error: string } {
  if (!Array.isArray(b.members)) return { error: "members array required" };
  const out: MemberInput[] = [];
  const seen = new Set<string>();
  let totalPercent = 0;
  for (const m of b.members) {
    const memberId = typeof m?.memberId === "string" ? m.memberId.trim() : "";
    if (!memberId) return { error: "memberId required" };
    if (seen.has(memberId)) return { error: "duplicate member" };
    seen.add(memberId);
    let percent: number | null = null;
    if (m.percent !== undefined && m.percent !== null && m.percent !== "") {
      const p = Number(m.percent);
      if (!isFinite(p) || p < 0 || p > 100) {
        return { error: "percent must be 0..100" };
      }
      percent = p;
      totalPercent += p;
    }
    out.push({ memberId, percent });
  }
  if (totalPercent > 100) {
    return { error: "total percent must not exceed 100" };
  }
  return out;
}

export async function PUT(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("finance.admin");
    const { id } = await ctx.params;
    const b = await req.json().catch(() => ({}));

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }

    const members = parseBody(b);
    if ("error" in members) {
      return NextResponse.json({ error: members.error }, { status: 400 });
    }

    const before = await prisma.projectMember.findMany({
      where: { projectId: id },
      select: { memberId: true, percent: true },
    });

    await prisma.$transaction(async tx => {
      await tx.projectMember.deleteMany({ where: { projectId: id } });
      if (members.length) {
        await tx.projectMember.createMany({
          data: members.map(m => ({
            projectId: id,
            memberId: m.memberId,
            percent: m.percent === null ? null : (m.percent ?? null),
          })),
        });
      }
    });

    const after = await prisma.projectMember.findMany({
      where: { projectId: id },
      select: { memberId: true, percent: true },
    });

    await writeAudit(
      me.id,
      "UPDATE",
      "project",
      id,
      { members: before },
      { members: after }
    );

    return NextResponse.json({
      members: after.map(m => ({
        memberId: m.memberId,
        percent: m.percent?.toString() ?? null,
      })),
    });
  } catch (e) {
    return toApiError(e, t);
  }
}
