import { NextResponse } from "next/server";
import crypto from "crypto";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { rollupMetrics } from "@/lib/metrics-rollup";

/**
 * Свёртка и чистка истории метрик. Зовётся воркером; вручную доступна админу.
 * Идемпотентна — повторный прогон перезаписывает те же интервалы.
 */
function workerAuthorized(req: Request): boolean {
  const expected = process.env.TUCKTUCK_WORKER_TOKEN || "";
  if (!expected) return false;
  const a = Buffer.from(req.headers.get("x-worker-token") || "");
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  try {
    if (!workerAuthorized(req)) await requirePermission("users.manage");
    return NextResponse.json(await rollupMetrics());
  } catch (e) {
    return toApiError(e);
  }
}
