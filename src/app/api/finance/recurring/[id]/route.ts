import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";
import { validateScope } from "@/lib/finance";
import { writeAudit } from "@/lib/finance-audit";
import {
  parseAmount,
  parseCurrency,
  parseDate,
  parseFrequency,
  parseInterval,
  parseDayOfMonth,
  parseScope,
  decimalStr,
} from "@/lib/finance-api";
import type { TFunc } from "@/lib/i18n/translate";

type Ctx = { params: Promise<{ id: string }> };

function parseBody(
  b: any,
  t: TFunc
): Record<string, unknown> | { error: string } {
  const out: Record<string, unknown> = {};

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
  }

  if (b.currency !== undefined) {
    const currency = parseCurrency(b.currency);
    if (!currency) return { error: t("finance.err.currencyRequired") };
    out.currency = currency;
  }

  let scope: ReturnType<typeof parseScope> = null;
  let projectId: string | null = null;
  let memberId: string | null = null;

  if (b.scope !== undefined) {
    scope = parseScope(b.scope);
    if (!scope) return { error: t("finance.err.unknownScope") };
    out.scope = scope;
  }

  if (b.projectId !== undefined) {
    projectId = b.projectId || null;
    out.projectId = projectId;
  }

  if (b.memberId !== undefined) {
    memberId = b.memberId || null;
    out.memberId = memberId;
  }

  if (b.frequency !== undefined) {
    const frequency = parseFrequency(b.frequency);
    if (!frequency) return { error: t("finance.err.unknownFrequency") };
    out.frequency = frequency;
  }

  if (b.interval !== undefined) {
    const interval = parseInterval(b.interval);
    if (interval === null) return { error: t("finance.err.intervalInvalid") };
    out.interval = interval;
  }

  if (b.dayOfMonth !== undefined) {
    const dayOfMonth = parseDayOfMonth(b.dayOfMonth);
    if (dayOfMonth !== null) out.dayOfMonth = dayOfMonth;
    else out.dayOfMonth = null;
  }

  if (b.nextRunAt !== undefined && b.nextRunAt !== null && b.nextRunAt !== "") {
    const d = parseDate(b.nextRunAt);
    if (!d) return { error: t("finance.err.dateInvalid") };
    out.nextRunAt = d;
  } else if (b.nextRunAt === null || b.nextRunAt === "") {
    return { error: t("finance.err.dateInvalid") };
  }

  if (typeof b.active === "boolean") out.active = b.active;

  return out;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("finance.manage");
    const { id } = await ctx.params;
    const b = await req.json().catch(() => ({}));

    const existing = await prisma.recurringExpense.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }

    const data = parseBody(b, t);
    if ("error" in data) return NextResponse.json(data, { status: 400 });

    const scope = (data.scope as any) ?? existing.scope;
    const projectId =
      data.projectId !== undefined
        ? (data.projectId as string | null)
        : existing.projectId;
    const memberId =
      data.memberId !== undefined
        ? (data.memberId as string | null)
        : existing.memberId;

    const scopeErr = validateScope("EXPENSE", scope, projectId, memberId);
    if (scopeErr)
      return NextResponse.json(
        { error: t("finance.err.scopeValidation") },
        { status: 400 }
      );

    const row = await prisma.recurringExpense.update({
      where: { id },
      data: data as any,
    });

    await writeAudit(me.id, "UPDATE", "recurring", id, existing, row);

    return NextResponse.json({
      row: {
        ...row,
        amount: row.amount.toString(),
        nextRunAt: row.nextRunAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
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

    const existing = await prisma.recurringExpense.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }

    const row = await prisma.recurringExpense.update({
      where: { id },
      data: { active: false },
    });

    await writeAudit(me.id, "UPDATE", "recurring", id, existing, {
      ...existing,
      active: false,
    });

    return NextResponse.json({
      row: {
        ...row,
        amount: row.amount.toString(),
        nextRunAt: row.nextRunAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      },
    });
  } catch (e) {
    return toApiError(e, t);
  }
}
