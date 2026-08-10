import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { getRates } from "@/lib/rates";

/** Текущие курсы — для диагностики в настройках. Обновление: ?force=1. */
export async function GET(req: Request) {
  try {
    await requirePermission("dashboard.view");
    const force = new URL(req.url).searchParams.get("force") === "1";
    const r = await getRates(force);
    return NextResponse.json({
      fetchedAt: r.fetchedAt,
      sources: r.sources,
      count: Object.keys(r.perUsd).length,
    });
  } catch (e) {
    return toApiError(e);
  }
}
