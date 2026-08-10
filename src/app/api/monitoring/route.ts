import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { visibilityWhere } from "@/lib/resources";
import { MONITORABLE, health } from "@/lib/monitoring";

/**
 * Сводка здоровья для дашборда: последний снимок по каждому наблюдаемому
 * ресурсу.
 *
 * Видимость — та же, что у ресурсов: метрики чужой группы не должны утекать
 * через мониторинг в обход правила из lib/resources.
 */
export async function GET() {
  try {
    const me = await requirePermission("resources.view");

    const rows = await prisma.resource.findMany({
      where: {
        ...visibilityWhere(me),
        isActive: true,
        kind: { in: [...MONITORABLE] },
      },
      select: {
        id: true,
        name: true,
        kind: true,
        ip: true,
        agentToken: true,
        isSelf: true,
        // Только последний снимок: история нужна графикам, а не сводке.
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
      orderBy: { name: "asc" },
    });

    const systems = rows.map(r => {
      const m = r.metrics[0] ?? null;
      return {
        id: r.id,
        name: r.name,
        kind: r.kind,
        ip: r.ip,
        // Наружу отдаём только факт подключения агента, не сам токен.
        agentConnected: !!r.agentToken || r.isSelf,
        isSelf: r.isSelf,
        health: health(m?.createdAt ?? null),
        cpu: m?.cpu ?? null,
        memory: m?.memory ?? null,
        disk: m?.disk ?? null,
        load1: m?.load1 ?? null,
        uptimeSec: m?.uptimeSec ?? null,
        lastSeen: m?.createdAt?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ systems });
  } catch (e) {
    return toApiError(e);
  }
}
