import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { collectSelf } from "@/lib/self-metrics";
import { tForRequest } from "@/lib/i18n/server";

/**
 * Снять метрики сервера самой панели и записать их.
 *
 * Зовётся воркером по расписанию (заголовком X-Worker-Token) — тем же, что
 * крутит напоминания. Отдельного агента для этого сервера не нужно: панель на
 * нём и так работает, а ставить агент рядом с собой означало бы просить ssh-ключ
 * к машине, на которой мы уже выполняемся.
 */
function workerAuthorized(req: Request): boolean {
  const expected = process.env.TUCKTUCK_WORKER_TOKEN || "";
  if (!expected) return false;
  const a = Buffer.from(req.headers.get("x-worker-token") || "");
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const t = tForRequest(req);
  try {
    if (!workerAuthorized(req)) await requirePermission("resources.manage");

    const self = await prisma.resource.findFirst({
      where: { isSelf: true, isActive: true },
      select: { id: true },
    });
    // Ресурс не заведён — это норма, а не ошибка: самомониторинг включают
    // кнопкой, и до неё писать метрики некуда.
    if (!self) return NextResponse.json({ ok: true, skipped: t("self.err.notEnabled") });

    const s = await collectSelf();
    await prisma.resourceMetric.create({
      data: {
        resourceId: self.id,
        cpu: s.cpu,
        memory: s.memory,
        disk: s.disk,
        load1: s.load1,
        uptimeSec: s.uptimeSec,
        extra: s.cores ? { cores: s.cores, source: "self" } : { source: "self" },
      },
    });
    return NextResponse.json({ ok: true, sample: s });
  } catch (e) {
    return toApiError(e, t);
  }
}
