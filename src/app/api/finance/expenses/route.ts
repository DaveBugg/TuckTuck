import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { parseListParams, toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";
import { getRates } from "@/lib/rates";
import { getSettings } from "@/lib/settings";
import { serializeDecimal } from "@/lib/finance-api";
import { prepareExpenseData, createExpense } from "@/lib/finance-service";
import type { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  try {
    await requirePermission("finance.view");
    const p = parseListParams(req.url, {
      sortable: ["date", "createdAt", "amount", "status"],
      defaultSort: "date",
      defaultOrder: "desc",
    });

    const status = p.get("status");
    const kind = p.get("kind");
    const scope = p.get("scope");
    const projectId = p.get("projectId");
    const memberId = p.get("memberId");
    const dateFrom = parseDate(p.get("dateFrom"));
    const dateTo = parseDate(p.get("dateTo"));

    const where: Prisma.ExpenseWhereInput = {
      ...(status === "PENDING" || status === "APPROVED" || status === "REJECTED"
        ? { status }
        : {}),
      ...(kind === "EXPENSE" || kind === "PAYOUT" ? { kind } : {}),
      ...(scope === "TEAM" || scope === "PROJECT" || scope === "MEMBER"
        ? { scope }
        : {}),
      ...(projectId ? { projectId } : {}),
      ...(memberId ? { memberId } : {}),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
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
      prisma.expense.findMany({
        where,
        orderBy: { [p.sort]: p.order },
        skip: p.skip,
        take: p.take,
        select: {
          id: true,
          kind: true,
          status: true,
          title: true,
          description: true,
          amount: true,
          currency: true,
          amountBase: true,
          date: true,
          scope: true,
          projectId: true,
          memberId: true,
          tags: true,
          sourceChatId: true,
          sourceMessageId: true,
          createdById: true,
          approvedById: true,
          approvedAt: true,
          createdAt: true,
          project: { select: { id: true, name: true } },
          member: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.expense.count({ where }),
    ]);

    return NextResponse.json({
      rows: rows.map(r => ({
        ...r,
        amount: r.amount.toString(),
        amountBase: r.amountBase.toString(),
        date: r.date.toISOString().slice(0, 10),
        approvedAt: r.approvedAt?.toISOString() ?? null,
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
    const me = await requirePermission("finance.submit");
    const b = await req.json().catch(() => ({}));

    const settings = await getSettings();
    const rates = await getRates();

    const data = prepareExpenseData(
      b,
      t,
      settings.displayCurrency,
      rates.perUsd
    );
    if ("error" in data) return NextResponse.json(data, { status: 400 });

    const row = await createExpense({ me, data });

    return NextResponse.json(
      {
        row: {
          ...row,
          amount: row.amount.toString(),
          amountBase: row.amountBase.toString(),
        },
      },
      { status: 201 }
    );
  } catch (e) {
    return toApiError(e, t);
  }
}

function parseDate(value: unknown): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
}
