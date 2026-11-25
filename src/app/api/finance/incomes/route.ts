import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { parseListParams, toApiError } from "@/lib/list-query";
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
import { splitIncome } from "@/lib/finance";
import { writeAudit } from "@/lib/finance-audit";
import type { Prisma } from "@/generated/prisma/client";
import type { TFunc } from "@/lib/i18n/translate";

function parseBody(
  b: any,
  t: TFunc,
  displayCurrency: string,
  perUsd: Record<string, number>
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

  if (b.projectId !== undefined) out.projectId = b.projectId || null;

  if (b.date !== undefined && b.date !== null && b.date !== "") {
    const d = parseDate(b.date);
    if (!d) return { error: t("finance.err.dateInvalid") };
    out.date = d;
  } else {
    out.date = new Date();
  }

  const base = toAmountBase(amount, currency, displayCurrency, perUsd);
  if (base === null) return { error: t("finance.err.noRate") };
  out.amountBase = decimalStr(base);

  return out;
}

export async function GET(req: Request) {
  try {
    await requirePermission("finance.view");
    const p = parseListParams(req.url, {
      sortable: ["date", "createdAt", "amount"],
      defaultSort: "date",
      defaultOrder: "desc",
    });

    const projectId = p.get("projectId");
    const dateFrom = parseDate(p.get("dateFrom"));
    const dateTo = parseDate(p.get("dateTo"));

    const where: Prisma.IncomeWhereInput = {
      ...(projectId ? { projectId } : {}),
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
      prisma.income.findMany({
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
          amountBase: true,
          date: true,
          projectId: true,
          createdById: true,
          createdAt: true,
          project: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { distributions: true } },
        },
      }),
      prisma.income.count({ where }),
    ]);

    return NextResponse.json({
      rows: rows.map(r => ({
        ...r,
        amount: r.amount.toString(),
        amountBase: r.amountBase.toString(),
        date: r.date.toISOString().slice(0, 10),
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

    const settings = await getSettings();
    const rates = await getRates();

    const data = parseBody(b, t, settings.displayCurrency, rates.perUsd);
    if ("error" in data) return NextResponse.json(data, { status: 400 });

    const distribute = b.distribute === true;
    const projectId = (data.projectId ?? null) as string | null;

    let distributions: {
      memberId: string;
      amountBase: number;
      percent: number;
    }[] = [];
    if (distribute && projectId) {
      const members = await prisma.projectMember.findMany({
        where: { projectId },
        select: { memberId: true, percent: true },
      });
      const withPercent = members
        .filter(m => m.percent !== null)
        .map(m => ({ memberId: m.memberId, percent: Number(m.percent) }));
      const amountBase = Number(data.amountBase);
      distributions = splitIncome(amountBase, withPercent);
    }

    const row = await prisma.$transaction(async tx => {
      const income = await tx.income.create({
        data: {
          ...(data as any),
          createdById: me.id,
        },
      });
      if (distributions.length) {
        await tx.distribution.createMany({
          data: distributions.map(d => ({
            memberId: d.memberId,
            incomeId: income.id,
            projectId,
            amountBase: d.amountBase,
            percent: d.percent,
          })),
        });
      }
      return income;
    });

    await writeAudit(me.id, "CREATE", "income", row.id, null, {
      ...data,
      createdById: me.id,
      distributions,
    });

    return NextResponse.json(
      {
        row: {
          ...row,
          amount: row.amount.toString(),
          amountBase: row.amountBase.toString(),
        },
        distributions,
      },
      { status: 201 }
    );
  } catch (e) {
    return toApiError(e, t);
  }
}
