import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { parseListParams, toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";
import { writeAudit } from "@/lib/finance-audit";
import type { Prisma } from "@prisma/client";
import type { TFunc } from "@/lib/i18n/translate";

function parseBody(
  b: any,
  t: TFunc
): Record<string, unknown> | { error: string } {
  const out: Record<string, unknown> = {};
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: t("finance.err.titleRequired") };
  out.name = name;
  if (b.description !== undefined) {
    out.description =
      typeof b.description === "string" ? b.description.trim() : "";
  }
  return out;
}

export async function GET(req: Request) {
  try {
    await requirePermission("finance.view");
    const p = parseListParams(req.url, {
      sortable: ["name", "createdAt"],
      defaultSort: "createdAt",
    });

    const archived = p.get("archived");
    const where: Prisma.ProjectWhereInput = {
      ...(archived === "true"
        ? { archived: true }
        : archived === "false"
          ? { archived: false }
          : {}),
      ...(p.search
        ? {
            OR: [
              { name: { contains: p.search, mode: "insensitive" as const } },
              {
                description: {
                  contains: p.search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.project.findMany({
        where,
        orderBy: { [p.sort]: p.order },
        skip: p.skip,
        take: p.take,
        select: {
          id: true,
          name: true,
          description: true,
          archived: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { members: true, incomes: true, expenses: true } },
        },
      }),
      prisma.project.count({ where }),
    ]);

    return NextResponse.json({
      rows: rows.map(r => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
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

    const row = await prisma.project.create({ data: data as any });
    await writeAudit(me.id, "CREATE", "project", row.id, null, data);

    return NextResponse.json({ row }, { status: 201 });
  } catch (e) {
    return toApiError(e, t);
  }
}
