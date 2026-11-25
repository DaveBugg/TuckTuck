import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { parseListParams, toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";
import { writeAudit } from "@/lib/finance-audit";
import type { Prisma } from "@/generated/prisma/client";
import type { TFunc } from "@/lib/i18n/translate";

function parseBody(
  b: any,
  t: TFunc
): Record<string, unknown> | { error: string } {
  const out: Record<string, unknown> = {};
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: t("finance.err.titleRequired") };
  out.name = name;
  if (b.position !== undefined) {
    out.position = typeof b.position === "string" ? b.position.trim() : "";
  }
  if (b.userId !== undefined) out.userId = b.userId || null;
  return out;
}

export async function GET(req: Request) {
  try {
    await requirePermission("finance.view");
    const p = parseListParams(req.url, {
      sortable: ["name", "createdAt"],
      defaultSort: "createdAt",
    });

    const active = p.get("active");
    const where: Prisma.TeamMemberWhereInput = {
      ...(active === "true"
        ? { active: true }
        : active === "false"
          ? { active: false }
          : {}),
      ...(p.search
        ? {
            OR: [
              { name: { contains: p.search, mode: "insensitive" as const } },
              {
                position: {
                  contains: p.search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.teamMember.findMany({
        where,
        orderBy: { [p.sort]: p.order },
        skip: p.skip,
        take: p.take,
        select: {
          id: true,
          name: true,
          position: true,
          active: true,
          userId: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true } },
          _count: { select: { distributions: true, expenses: true } },
        },
      }),
      prisma.teamMember.count({ where }),
    ]);

    return NextResponse.json({
      rows: rows.map(r => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
    });
  } catch (e) {
    return toApiError(e);
  }
}

export async function POST(req: Request) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("finance.admin");
    const b = await req.json().catch(() => ({}));

    const data = parseBody(b, t);
    if ("error" in data) return NextResponse.json(data, { status: 400 });

    const row = await prisma.teamMember.create({ data: data as any });
    await writeAudit(me.id, "CREATE", "member", row.id, null, data);

    return NextResponse.json({ row }, { status: 201 });
  } catch (e) {
    return toApiError(e, t);
  }
}
