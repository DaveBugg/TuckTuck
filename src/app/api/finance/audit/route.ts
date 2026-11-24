import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { parseListParams, toApiError } from "@/lib/list-query";
import type { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  try {
    await requirePermission("finance.manage");
    const p = parseListParams(req.url, {
      sortable: ["createdAt"],
      defaultSort: "createdAt",
      defaultOrder: "desc",
    });

    const entity = p.get("entity");
    const action = p.get("action");
    const actorId = p.get("actorId");

    const where: Prisma.FinanceAuditLogWhereInput = {
      ...(entity ? { entity } : {}),
      ...(action ? { action } : {}),
      ...(actorId ? { actorId } : {}),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.financeAuditLog.findMany({
        where,
        orderBy: { [p.sort]: p.order },
        skip: p.skip,
        take: p.take,
        select: {
          id: true,
          actorId: true,
          action: true,
          entity: true,
          entityId: true,
          before: true,
          after: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.financeAuditLog.count({ where }),
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
