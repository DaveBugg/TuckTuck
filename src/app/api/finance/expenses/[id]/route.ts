import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";
import { getRates } from "@/lib/rates";
import { getSettings } from "@/lib/settings";
import {
  parseAmount,
  parseCurrency,
  parseDate,
  decimalStr,
  toAmountBase,
} from "@/lib/finance-api";
import { writeAudit } from "@/lib/finance-audit";
import { validateScope } from "@/lib/finance";
import type { TFunc } from "@/lib/i18n/translate";
import type { Prisma } from "@/generated/prisma/client";

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
  if (b.description !== undefined) {
    out.description =
      typeof b.description === "string" ? b.description.trim() : "";
  }
  if (b.date !== undefined) {
    const d = parseDate(b.date);
    if (!d) return { error: t("finance.err.dateInvalid") };
    out.date = d;
  }
  if (b.projectId !== undefined) out.projectId = b.projectId || null;
  if (b.memberId !== undefined) out.memberId = b.memberId || null;
  if (b.tags !== undefined) {
    out.tags = Array.isArray(b.tags)
      ? b.tags
          .filter((x: unknown): x is string => typeof x === "string")
          .map((x: string) => x.trim())
      : [];
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

async function canEdit(
  row: Prisma.ExpenseGetPayload<{}>,
  me: { id: string; role: string }
): Promise<boolean> {
  if (row.status === "PENDING") {
    return (
      row.createdById === me.id || hasPermission(me.role, "finance.manage")
    );
  }
  // APPROVED/REJECTED — только manage.
  return hasPermission(me.role, "finance.manage");
}

export async function PATCH(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("finance.submit");
    const { id } = await ctx.params;
    const b = await req.json().catch(() => ({}));

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }

    const isManager = me.role === "ADMIN" || undefined; // грубая проверка; тонкая — в permissions.ts
    if (!(await canEdit(existing, me))) {
      return NextResponse.json(
        { error: t("finance.err.cannotEditApproved") },
        { status: 403 }
      );
    }

    const settings = await getSettings();
    const rates = await getRates();
    const data = parseBody(b, t, settings.displayCurrency, rates.perUsd);
    if ("error" in data) return NextResponse.json(data, { status: 400 });

    const finalKind = existing.kind;
    const finalScope = existing.scope;
    const finalProjectId =
      "projectId" in data
        ? (data.projectId as string | null)
        : existing.projectId;
    const finalMemberId =
      "memberId" in data ? (data.memberId as string | null) : existing.memberId;
    if (validateScope(finalKind, finalScope, finalProjectId, finalMemberId)) {
      return NextResponse.json(
        { error: t("finance.err.scopeValidation") },
        { status: 400 }
      );
    }

    const row = await prisma.expense.update({
      where: { id },
      data: data as any,
    });

    await writeAudit(me.id, "UPDATE", "expense", id, existing, row);

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
    const me = await requirePermission("finance.submit");
    const { id } = await ctx.params;

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }

    if (!(await canEdit(existing, me))) {
      return NextResponse.json(
        { error: t("finance.err.cannotEditApproved") },
        { status: 403 }
      );
    }

    await prisma.expense.delete({ where: { id } });
    await writeAudit(me.id, "DELETE", "expense", id, existing, null);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return toApiError(e, t);
  }
}
