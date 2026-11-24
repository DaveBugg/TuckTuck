import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";

export async function GET(req: Request) {
  const t = tForRequest(req);
  try {
    await requirePermission("finance.admin");
    const rows = await prisma.telegramApprovedGroup.findMany({
      orderBy: { createdAt: "desc" },
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
      rows: rows.map(r => ({
        ...r,
        chatId: String(r.chatId),
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    return toApiError(e, t);
  }
}
