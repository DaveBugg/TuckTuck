import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";
import { getRates } from "@/lib/rates";
import { getSettings } from "@/lib/settings";
import {
  parseAmount,
  parseCurrency,
  parseDate,
  toAmountBase,
  decimalStr,
} from "@/lib/finance-api";
import { writeAudit } from "@/lib/finance-audit";
import type { TFunc } from "@/lib/i18n/translate";

type Ctx = { params: Promise<{ id: string }> };

function parseBody(
  b: any,
  t: TFunc,
  displayCurrency: string,
  perUsd: Record<string, number>
): Record<string, unknown> | { error: string } {
  const out: Record<string, unknown> = {};
  let amountChanged = false;
  let currencyChanged = false;

  if (b.title !== undefined) {
    const title = typeof b.title === "string" ? b.title.trim() : "";
    if (!title) return { error: t("finance.err.titleRequired") };
    out.title = title;
  }
  if (b.description !== undefined) {
    out.description =
      typeof b.description === "string" ? b.description.trim() : "";
  }
  if (b.amount !== undefined) {
    const amount = parseAmount(b.amount);
    if (amount === null) return { error: t("finance.err.amountRequired") };
    out.amount = decimalStr(amount);
    amountChanged = true;
  }
  if (b.currency !== undefined) {
    const currency = parseCurrency(b.currency);
    if (!currency) return { error: t("finance.err.currencyRequired") };
    out.currency = currency;
    currencyChanged = true;
  }
  if (b.date !== undefined) {
    const d = parseDate(b.date);
    if (!d) return { error: t("finance.err.dateInvalid") };
    out.date = d;
  }

  if (amountChanged || currencyChanged) {
    const amountNum = Number(out.amount ?? b.amount);
    const currency = String(out.currency ?? b.currency);
    const base = toAmountBase(amountNum, currency, displayCurrency, perUsd);
    if (base === null) return { error: t("finance.err.noRate") };
    out.amountBase = decimalStr(base);
  }

  return out;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("finance.manage");
    const { id } = await ctx.params;
    const b = await req.json().catch(() => ({}));

    const existing = await prisma.income.findUnique({
      where: { id },
      include: { _count: { select: { distributions: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }

    if (
      existing._count.distributions > 0 &&
      (b.amount !== undefined || b.currency !== undefined)
    ) {
      return NextResponse.json(
        { error: t("finance.err.cannotEditDistributed") },
        { status: 409 }
      );
    }

    const settings = await getSettings();
    const rates = await getRates();
    const data = parseBody(b, t, settings.displayCurrency, rates.perUsd);
    if ("error" in data) return NextResponse.json(data, { status: 400 });

    const row = await prisma.income.update({
      where: { id },
      data: data as any,
    });

    await writeAudit(me.id, "UPDATE", "income", id, existing, row);

    return NextResponse.json({
      row: {
        ...row,
        amount: row.amount.toString(),
        amountBase: row.amountBase.toString(),
      },
    });
  } catch (e) {
    return toApiError(e, t);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("finance.manage");
    const { id } = await ctx.params;

    const existing = await prisma.income.findUnique({
      where: { id },
      include: { _count: { select: { distributions: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }
    if (existing._count.distributions > 0) {
      return NextResponse.json(
        { error: t("finance.err.cannotEditApproved") },
        { status: 400 }
      );
    }

    await prisma.income.delete({ where: { id } });
    await writeAudit(me.id, "DELETE", "income", id, existing, null);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return toApiError(e, t);
  }
}
