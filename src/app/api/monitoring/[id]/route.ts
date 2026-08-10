import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { visibilityWhere } from "@/lib/resources";
import { health } from "@/lib/monitoring";
import { tForRequest } from "@/lib/i18n/server";

type Ctx = { params: Promise<{ id: string }> };

/** Сводка по одному ресурсу — для попапа в списке и подсказки при наведении. */
export async function GET(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("resources.view");
    const { id } = await ctx.params;

    const r = await prisma.resource.findFirst({
      where: { id, ...visibilityWhere(me) },
      select: {
        id: true,
        name: true,
        kind: true,
        ip: true,
        agentToken: true,
        isSelf: true,
        metrics: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            cpu: true,
            memory: true,
            disk: true,
            load1: true,
            uptimeSec: true,
            createdAt: true,
          },
        },
      },
    });
    if (!r) return NextResponse.json({ error: t("err.notFound") }, { status: 404 });

    const m = r.metrics[0] ?? null;
    return NextResponse.json({
      system: {
        id: r.id,
        name: r.name,
        kind: r.kind,
        ip: r.ip,
        // Токен наружу не отдаём — только факт подключения.
        agentConnected: !!r.agentToken || r.isSelf,
        isSelf: r.isSelf,
        health: health(m?.createdAt ?? null),
        cpu: m?.cpu ?? null,
        memory: m?.memory ?? null,
        disk: m?.disk ?? null,
        load1: m?.load1 ?? null,
        uptimeSec: m?.uptimeSec ?? null,
        lastSeen: m?.createdAt?.toISOString() ?? null,
      },
    });
  } catch (e) {
    return toApiError(e, t);
  }
}
