import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { nonNegFloat, nonNegInt, pct } from "@/lib/monitoring";

/**
 * Приём снимка метрик от агента.
 *
 * БЕЗ сессии: агент — не человек, он авторизуется своим токеном ресурса. Токен
 * свой на каждый ресурс, поэтому утёкший с одной машины не даёт слать метрики
 * за остальные.
 *
 * Отвечаем одинаково на «неверный токен» и «нет такого ресурса»: иначе агент
 * с чужим токеном мог бы перебором выяснять, какие токены существуют.
 */
export async function POST(req: Request) {
  const token = (req.headers.get("x-agent-token") || "").trim();
  if (!token || token.length < 20) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Ищем по токену, а не по id из тела: id можно подставить чужой.
  const resource = await prisma.resource.findFirst({
    where: { agentToken: token },
    select: { id: true },
  });
  if (!resource) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));

  // Всё, что не разобралось в число, становится null, а не роняет снимок:
  // агент на урезанной системе может не суметь прочитать что-то одно, и терять
  // из-за этого остальные метрики незачем.
  const known = new Set(["cpu", "memory", "disk", "load1", "uptime"]);
  const extra: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(b ?? {})) {
    // Только скаляры: вложенные объекты от чужого агента раздули бы строку и
    // ничего не дали бы сводке.
    if (!known.has(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
      extra[k] = v;
    }
  }

  await prisma.resourceMetric.create({
    data: {
      resourceId: resource.id,
      cpu: pct(b?.cpu),
      memory: pct(b?.memory),
      disk: pct(b?.disk),
      load1: nonNegFloat(b?.load1),
      uptimeSec: nonNegInt(b?.uptime),
      extra: Object.keys(extra).length ? extra : undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
