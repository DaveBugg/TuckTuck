import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import os from "node:os";
import { tForRequest } from "@/lib/i18n/server";
import { DEFAULT_REMINDER_DAYS } from "@/lib/resources";

/**
 * Включить мониторинг сервера самой панели.
 *
 * Заводит обычный ресурс с флагом isSelf. Именно ресурс, а не отдельную
 * сущность: за этот сервер тоже платят, и он должен попадать в общий список
 * оплат наравне с остальными.
 *
 * Сумму и дату оплаты пользователь потом поправит в карточке — выдумывать их
 * за него нельзя, а заводить ресурс без них схема не даёт.
 */

/** «current» и следом имя хоста. */
function selfName(): string {
  const host = (os.hostname() || "").trim();
  return host ? `current · ${host}` : "current";
}

export async function POST(req: Request) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("resources.manage");

    const existing = await prisma.resource.findFirst({ where: { isSelf: true } });
    if (existing) {
      return NextResponse.json({ row: { id: existing.id, name: existing.name }, already: true });
    }

    const today = new Date();
    const next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate()));

    const row = await prisma.resource.create({
      data: {
        kind: "SERVER",
        // «current» впереди, хеш — следом. Имя контейнера вида 28533d7a096c
        // ни о чём не говорит и в списке ресурсов выглядит как мусор, а его
        // первым делом ищут глазами как «тот самый сервер».
        name: selfName(),
        note: t("self.note"),
        isSelf: true,
        amount: "0.00",
        currency: "USD",
        periodValue: 1,
        periodUnit: "MONTH",
        nextPaymentAt: next,
        createdById: me.id,
        reminders: { create: DEFAULT_REMINDER_DAYS.map(daysBefore => ({ daysBefore })) },
      },
      select: { id: true, name: true },
    });
    return NextResponse.json({ row }, { status: 201 });
  } catch (e) {
    return toApiError(e, t);
  }
}

/** Выключить: ресурс остаётся, перестаёт быть «этим сервером». */
export async function DELETE() {
  try {
    await requirePermission("resources.manage");
    await prisma.resource.updateMany({ where: { isSelf: true }, data: { isSelf: false } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toApiError(e);
  }
}
