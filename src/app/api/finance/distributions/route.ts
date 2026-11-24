import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { parseListParams, toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";
import { parseAmount, decimalStr } from "@/lib/finance-api";
import { projectBalance, teamBalance } from "@/lib/finance";
import { writeAudit } from "@/lib/finance-audit";
import type { Prisma } from "@prisma/client";
import type { TFunc } from "@/lib/i18n/translate";

function parseBody(
  b: any,
  t: TFunc
): Record<string, unknown> | { error: string } {
  const out: Record<string, unknown> = {};

  const memberId = typeof b.memberId === "string" ? b.memberId.trim() : "";
  if (!memberId) return { error: t("finance.err.memberIdRequired") };
  out.memberId = memberId;

  out.projectId = b.projectId || null;

  if (b.percent !== undefined && b.percent !== null && b.percent !== "") {
    const percent = Number(b.percent);
    if (!isFinite(percent) || percent < 0 || percent > 100) {
      return { error: t("finance.err.percentInvalid") };
    }
    out.percent = percent;
  }

  if (
    b.amountBase !== undefined &&
    b.amountBase !== null &&
    b.amountBase !== ""
  ) {
    const amount = parseAmount(b.amountBase);
    if (amount === null) return { error: t("finance.err.amountRequired") };
    out.amountBase = decimalStr(amount);
  }

  if (b.note !== undefined) {
    out.note = typeof b.note === "string" ? b.note.trim() : "";
  }

  if (out.amountBase === undefined && out.percent === undefined) {
    return { error: t("finance.err.amountRequired") };
  }

  return out;
}

export async function GET(req: Request) {
  try {
    await requirePermission("finance.view");
    const p = parseListParams(req.url, {
      sortable: ["createdAt"],
      defaultSort: "createdAt",
    });

    const memberId = p.get("memberId");
    const projectId = p.get("projectId");
    const incomeId = p.get("incomeId");

    const where: Prisma.DistributionWhereInput = {
      ...(memberId ? { memberId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(incomeId ? { incomeId } : {}),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.distribution.findMany({
        where,
        orderBy: { [p.sort]: p.order },
        skip: p.skip,
        take: p.take,
        select: {
          id: true,
          memberId: true,
          incomeId: true,
          projectId: true,
          amountBase: true,
          percent: true,
          note: true,
          createdAt: true,
          member: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          income: { select: { id: true, title: true } },
        },
      }),
      prisma.distribution.count({ where }),
    ]);

    return NextResponse.json({
      rows: rows.map(r => ({
        ...r,
        amountBase: r.amountBase.toString(),
        percent: r.percent?.toString() ?? null,
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

    const projectId = (data.projectId ?? null) as string | null;

    // Расчёт доступного остатка: проект или команда.
    let available = 0;
    if (projectId) {
      const [incomes, distributions, expenses] = await Promise.all([
        prisma.income.findMany({
          where: { projectId },
          select: { amountBase: true },
        }),
        prisma.distribution.findMany({
          where: { projectId },
          select: { amountBase: true },
        }),
        prisma.expense.findMany({
          where: { projectId, kind: "EXPENSE", status: "APPROVED" },
          select: { amountBase: true, kind: true },
        }),
      ]);
      available = projectBalance(incomes, distributions, expenses);
    } else {
      const [incomes, distributions, allExpenses] = await Promise.all([
        prisma.income.findMany({ select: { amountBase: true } }),
        prisma.distribution.findMany({ select: { amountBase: true } }),
        prisma.expense.findMany({
          where: {
            kind: { in: ["EXPENSE", "PAYOUT"] },
            status: "APPROVED",
          },
          select: { amountBase: true, kind: true },
        }),
      ]);
      available = teamBalance(incomes, distributions, allExpenses);
    }

    let amountBase: number;
    if (data.percent !== undefined) {
      amountBase =
        Math.round(((available * Number(data.percent)) / 100) * 100) / 100;
    } else {
      amountBase = Number(data.amountBase);
    }

    if (amountBase > available + 1e-8) {
      return NextResponse.json(
        { error: t("finance.err.insufficientBalance") },
        { status: 400 }
      );
    }

    const row = await prisma.distribution.create({
      data: {
        memberId: String(data.memberId),
        projectId,
        amountBase: decimalStr(amountBase),
        percent:
          data.percent !== undefined ? Number(data.percent).toFixed(2) : null,
        note: String(data.note ?? ""),
      },
    });

    await writeAudit(me.id, "CREATE", "distribution", row.id, null, {
      ...data,
      amountBase: decimalStr(amountBase),
    });

    return NextResponse.json(
      {
        row: {
          ...row,
          amountBase: row.amountBase.toString(),
          percent: row.percent?.toString() ?? null,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    return toApiError(e, t);
  }
}
