import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { visibilityWhere } from "@/lib/resources";
import { getSettings } from "@/lib/settings";
import { PERIODS, metricsHistory, type PeriodDays } from "@/lib/metrics-history";
import { tForRequest } from "@/lib/i18n/server";

type Ctx = { params: Promise<{ id: string }> };

/** Средние за период и распределение нагрузки по часам суток. */
export async function GET(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("resources.view");
    const { id } = await ctx.params;

    // Видимость обязательна и здесь: иначе историю чужой группы можно было бы
    // прочитать по угаданному id в обход правила из lib/resources.
    const r = await prisma.resource.findFirst({
      where: { id, ...visibilityWhere(me) },
      select: { id: true },
    });
    if (!r) return NextResponse.json({ error: t("err.notFound") }, { status: 404 });

    const raw = Number(new URL(req.url).searchParams.get("days"));
    // Whitelist, а не clamp: период уходит в вычисление границы, и принимать
    // произвольное число значит разрешить запрос за десять лет одним параметром.
    const days: PeriodDays = (PERIODS as readonly number[]).includes(raw)
      ? (raw as PeriodDays)
      : 7;

    const { timezone } = await getSettings();
    return NextResponse.json(await metricsHistory(id, days, timezone));
  } catch (e) {
    return toApiError(e, t);
  }
}
