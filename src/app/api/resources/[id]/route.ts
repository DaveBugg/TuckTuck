import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { visibilityWhere, KINDS, PERIOD_UNITS, CURRENCIES, CHAINS } from "@/lib/resources";
import { tForRequest } from "@/lib/i18n/server";
import type { TFunc } from "@/lib/i18n/translate";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Ресурс, доступный этому пользователю, или null.
 *
 * Проверяем видимость ДАЖЕ на изменяющих операциях, хотя сейчас право
 * resources.manage есть только у ADMIN, который видит всё. Это страховка на
 * будущее: как только право получит роль с ограниченной видимостью, забытая
 * проверка превратится в «правлю по угаданному id».
 */
async function visible(id: string, me: { id: string; role: any }) {
  return prisma.resource.findFirst({ where: { id, ...visibilityWhere(me) }, select: { id: true } });
}

function parsePatch(b: any, t: TFunc) {
  const out: Record<string, unknown> = {};
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!name) return { error: t("res.err.nameRequired") };
    out.name = name;
  }
  if (b.kind !== undefined) {
    if (!KINDS.includes(b.kind)) return { error: t("res.err.unknownKind") };
    out.kind = b.kind;
  }
  if (b.amount !== undefined) {
    const a = Number(b.amount);
    if (!isFinite(a) || a < 0) return { error: t("res.err.amountNegative") };
    out.amount = a.toFixed(8);
  }
  if (b.isCrypto !== undefined) out.isCrypto = !!b.isCrypto;
  if (b.currency !== undefined) {
    const c = String(b.currency).trim().toUpperCase();
    if (c && !CURRENCIES.includes(c as any)) return { error: t("res.err.unknownCurrency", { code: c }) };
    if (c) out.currency = c;
  }
  if (b.chain !== undefined) {
    const c = String(b.chain).trim().toUpperCase();
    if (c && !CHAINS.includes(c as any)) return { error: t("res.err.unknownChain", { code: c }) };
    out.chain = c;
  }
  if (b.nextPaymentAt !== undefined) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b.nextPaymentAt || ""));
    if (!m) return { error: t("res.err.dateFormat") };
    out.nextPaymentAt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  if (b.periodValue !== undefined) {
    const v = parseInt(b.periodValue, 10);
    if (!isFinite(v) || v < 1) return { error: t("res.err.periodValue") };
    out.periodValue = v;
  }
  if (b.periodUnit !== undefined) {
    if (!PERIOD_UNITS.includes(b.periodUnit)) return { error: t("res.err.periodUnit") };
    out.periodUnit = b.periodUnit;
  }
  for (const f of ["note", "ip", "url", "domain"] as const) {
    if (b[f] !== undefined) out[f] = typeof b[f] === "string" ? b[f].trim() : "";
  }
  if (b.port !== undefined) {
    if (b.port === null || b.port === "") out.port = null;
    else {
      const p = parseInt(b.port, 10);
      if (!isFinite(p) || p < 1 || p > 65535) return { error: t("res.err.portRange") };
      out.port = p;
    }
  }
  if (b.providerId !== undefined) out.providerId = b.providerId || null;
  if (b.groupId !== undefined) out.groupId = b.groupId || null;
  if (b.isActive !== undefined) out.isActive = !!b.isActive;
  return out;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("resources.manage");
    const { id } = await ctx.params;
    if (!(await visible(id, me))) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }

    const b = await req.json().catch(() => ({}));
    const data = parsePatch(b, t);
    if ((data as any).error) return NextResponse.json(data, { status: 400 });

    // Теги приходят полным набором, а не дельтой: форма всегда знает итоговый
    // список, и «удалить всё, записать присланное» не оставляет расхождений.
    const tagIds: string[] | null = Array.isArray(b.tagIds) ? b.tagIds.filter(Boolean) : null;

    const row = await prisma.$transaction(async tx => {
      if (tagIds) {
        await tx.resourceTag.deleteMany({ where: { resourceId: id } });
        if (tagIds.length) {
          await tx.resourceTag.createMany({ data: tagIds.map(tagId => ({ resourceId: id, tagId })) });
        }
      }
      return tx.resource.update({
        where: { id },
        data: data as any,
        select: { id: true, name: true, kind: true },
      });
    });

    return NextResponse.json({ row });
  } catch (e) {
    return toApiError(e, t);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("resources.manage");
    const { id } = await ctx.params;
    if (!(await visible(id, me))) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }
    // Оплаты, теги, креды и напоминания уходят каскадом (onDelete: Cascade).
    await prisma.resource.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toApiError(e, t);
  }
}
