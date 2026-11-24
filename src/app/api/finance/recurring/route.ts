import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { parseListParams, toApiError } from "@/lib/list-query";
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
import type { Prisma } from "@prisma/client";
import type { TFunc } from "@/lib/i18n/translate";

function parseBody(
  b: any,
  t: TFunc
): Record<string, unknown> | { error: string } {
  const out: Record<string, unknown> = {};

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) return { error: t("finance.err.titleRequired") };
  out.title = title;

  if (b.description !== undefined) {
    out.description =
      typeof b.description === "string" ? b.description.trim() : "";
  }

  const amount = parseAmount(b.amount);
  if (amount === null) return { error: t("finance.err.amountRequired") };
  out.amount = decimalStr(amount);

  const currency = parseCurrency(b.currency);
  if (!currency) return { error: t("finance.err.currencyRequired") };
  out.currency = currency;

  const scope = parseScope(b.scope);
  if (!scope) return { error: t("finance.err.unknownScope") };
  out.scope = scope;

  const projectId = b.projectId !== undefined ? b.projectId || null : null;
  const memberId = b.memberId !== undefined ? b.memberId || null : null;

  const frequency = parseFrequency(b.frequency);
  if (!frequency) return { error: t("finance.err.unknownFrequency") };
  out.frequency = frequency;

  const interval = parseInterval(b.interval);
  if (interval === null) return { error: t("finance.err.intervalInvalid") };
  out.interval = interval;

  const dayOfMonth = parseDayOfMonth(b.dayOfMonth);
  if (dayOfMonth !== null) out.dayOfMonth = dayOfMonth;

  if (b.nextRunAt !== undefined && b.nextRunAt !== null && b.nextRunAt !== "") {
    const d = parseDate(b.nextRunAt);
    if (!d) return { error: t("finance.err.dateInvalid") };
    out.nextRunAt = d;
  } else {
    out.nextRunAt = new Date();
  }

  if (typeof b.active === "boolean") out.active = b.active;

  const scopeErr = validateScope("EXPENSE", scope, projectId, memberId);
  if (scopeErr) return { error: t("finance.err.scopeValidation") };

  out.projectId = projectId;
  out.memberId = memberId;

  return out;
}

export async function GET(req: Request) {
  try {
    await requirePermission("finance.view");
    const p = parseListParams(req.url, {
      sortable: ["nextRunAt", "createdAt", "title", "amount"],
      defaultSort: "nextRunAt",
      defaultOrder: "asc",
    });

    const active = p.get("active");
    const scope = p.get("scope");
    const projectId = p.get("projectId");
    const memberId = p.get("memberId");

    const where: Prisma.RecurringExpenseWhereInput = {
      ...(active === "true"
        ? { active: true }
        : active === "false"
          ? { active: false }
          : {}),
      ...(scope === "TEAM" || scope === "PROJECT" || scope === "MEMBER"
        ? { scope }
        : {}),
      ...(projectId ? { projectId } : {}),
      ...(memberId ? { memberId } : {}),
      ...(p.search
        ? {
            OR: [
              { title: { contains: p.search, mode: "insensitive" as const } },
              {
                description: {
                  contains: p.search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.recurringExpense.findMany({
        where,
        orderBy: { [p.sort]: p.order },
        skip: p.skip,
        take: p.take,
        select: {
          id: true,
          title: true,
          description: true,
          amount: true,
          currency: true,
          scope: true,
          projectId: true,
          memberId: true,
          frequency: true,
          interval: true,
          dayOfMonth: true,
          nextRunAt: true,
          active: true,
          createdById: true,
          createdAt: true,
          project: { select: { id: true, name: true } },
          member: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      }),
      prisma.recurringExpense.count({ where }),
    ]);

    return NextResponse.json({
      rows: rows.map(r => ({
        ...r,
        amount: r.amount.toString(),
        nextRunAt: r.nextRunAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      total,
    });
  } catch (e) {
    return toApiError(e);
  }
}

export async function POST(req: Request) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("finance.manage");
    const b = await req.json().catch(() => ({}));

    const data = parseBody(b, t);
    if ("error" in data) return NextResponse.json(data, { status: 400 });

    const row = await prisma.recurringExpense.create({
      data: { ...(data as any), createdById: me.id },
    });

    await writeAudit(me.id, "CREATE", "recurring", row.id, null, data);

    return NextResponse.json(
      {
        row: {
          ...row,
          amount: row.amount.toString(),
          nextRunAt: row.nextRunAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (e) {
    return toApiError(e, t);
  }
}
