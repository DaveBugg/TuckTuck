import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { visibilityWhere, addPeriod } from "@/lib/resources";
import { tForRequest } from "@/lib/i18n/server";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Отметить оплату: пишем строку в историю и двигаем дату следующей оплаты.
 *
 * Обе операции в ОДНОЙ транзакции: запись в историю без сдвига даты оставила бы
 * ресурс висеть в «просрочено», а сдвиг без записи потерял бы факт платежа.
 *
 * Дата сдвигается от ПЛАНОВОЙ даты, а не от сегодня. Иначе платёж, внесённый с
 * опозданием на три дня, сдвинул бы весь график на эти три дня — и через год
 * ежемесячная оплата уехала бы на месяц.
 */
export async function POST(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("resources.manage");
    const { id } = await ctx.params;

    const r = await prisma.resource.findFirst({
      where: { id, ...visibilityWhere(me) },
      select: {
        id: true,
        amount: true,
        currency: true,
        periodValue: true,
        periodUnit: true,
        nextPaymentAt: true,
      },
    });
    if (!r) return NextResponse.json({ error: t("err.notFound") }, { status: 404 });

    const b = await req.json().catch(() => ({}));

    // Дата платежа: присланная или плановая. Сумма — присланная или из карточки
    // (тариф мог отличаться разово: скидка, доплата за перенос).
    let paidAt = r.nextPaymentAt;
    if (b.paidAt) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b.paidAt));
      if (!m) return NextResponse.json({ error: t("res.err.payDateFormat") }, { status: 400 });
      paidAt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    }
    let amount = r.amount.toString();
    if (b.amount !== undefined && b.amount !== "") {
      const a = Number(b.amount);
      if (!isFinite(a) || a < 0) {
        return NextResponse.json({ error: t("res.err.amountNonNegative") }, { status: 400 });
      }
      amount = a.toFixed(2);
    }

    const next = addPeriod(r.nextPaymentAt, r.periodValue, r.periodUnit);

    const [, updated] = await prisma.$transaction([
      prisma.resourcePayment.create({
        data: {
          resourceId: r.id,
          amount,
          currency: r.currency,
          paidAt,
          note: typeof b.note === "string" ? b.note.trim() : "",
          recordedById: me.id,
        },
      }),
      prisma.resource.update({
        where: { id: r.id },
        data: { nextPaymentAt: next },
        select: { id: true, nextPaymentAt: true },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      nextPaymentAt: updated.nextPaymentAt.toISOString().slice(0, 10),
    });
  } catch (e) {
    return toApiError(e, t);
  }
}
