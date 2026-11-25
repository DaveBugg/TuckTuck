import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";
import { writeAudit } from "@/lib/finance-audit";
import { buildMonthlyStats } from "@/lib/finance";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    await requirePermission("finance.view");
    const { id } = await ctx.params;

    const row = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        archived: true,
        createdAt: true,
        updatedAt: true,
        members: {
          select: {
            percent: true,
            active: true,
            member: { select: { id: true, name: true, active: true } },
          },
        },
        resources: {
          select: {
            id: true,
            name: true,
            amount: true,
            currency: true,
            nextPaymentAt: true,
          },
          orderBy: { nextPaymentAt: "asc" },
        },
      },
    });
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 11);
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);

    const [recentIncomes, recentExpenses, monthlyIncomes, monthlyExpenses] =
      await prisma.$transaction([
        prisma.income.findMany({
          where: { projectId: id },
          orderBy: { date: "desc" },
          take: 10,
          select: {
            id: true,
            title: true,
            amount: true,
            currency: true,
            amountBase: true,
            date: true,
          },
        }),
        prisma.expense.findMany({
          where: { projectId: id, kind: "EXPENSE", status: "APPROVED" },
          orderBy: { date: "desc" },
          take: 10,
          select: {
            id: true,
            title: true,
            amount: true,
            currency: true,
            amountBase: true,
            date: true,
          },
        }),
        prisma.income.groupBy({
          by: ["date"],
          where: { projectId: id, date: { gte: since } },
          orderBy: { date: "asc" },
          _sum: { amountBase: true },
        }),
        prisma.expense.groupBy({
          by: ["date"],
          where: {
            projectId: id,
            kind: "EXPENSE",
            status: "APPROVED",
            date: { gte: since },
          },
          orderBy: { date: "asc" },
          _sum: { amountBase: true },
        }),
      ]);

    const monthlyStats = buildMonthlyStats(
      monthlyIncomes.map(m => ({
        amountBase: m._sum?.amountBase ?? 0,
        date: m.date,
      })),
      monthlyExpenses.map(m => ({
        amountBase: m._sum?.amountBase ?? 0,
        date: m.date,
      }))
    );

    return NextResponse.json({
      row: {
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        members: row.members.map(m => ({
          memberId: m.member.id,
          name: m.member.name,
          active: m.active,
          percent: m.percent?.toString() ?? null,
        })),
        resources: row.resources.map(r => ({
          ...r,
          amount: r.amount.toString(),
          nextPaymentAt: r.nextPaymentAt.toISOString().slice(0, 10),
        })),
        recentOps: [
          ...recentIncomes.map(r => ({
            id: r.id,
            kind: "income" as const,
            title: r.title,
            amount: r.amount.toString(),
            currency: r.currency,
            amountBase: r.amountBase.toString(),
            date: r.date.toISOString().slice(0, 10),
          })),
          ...recentExpenses.map(r => ({
            id: r.id,
            kind: "expense" as const,
            title: r.title,
            amount: r.amount.toString(),
            currency: r.currency,
            amountBase: r.amountBase.toString(),
            date: r.date.toISOString().slice(0, 10),
          })),
        ]
          .sort((a, b) => +new Date(b.date) - +new Date(a.date))
          .slice(0, 10),
        monthlyStats,
      },
    });
  } catch (e) {
    return toApiError(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("finance.manage");
    const { id } = await ctx.params;
    const b = await req.json().catch(() => ({}));

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (b.name !== undefined) {
      const name = typeof b.name === "string" ? b.name.trim() : "";
      if (!name)
        return NextResponse.json(
          { error: t("finance.err.titleRequired") },
          { status: 400 }
        );
      data.name = name;
    }
    if (b.description !== undefined) {
      data.description =
        typeof b.description === "string" ? b.description.trim() : "";
    }
    if (typeof b.archived === "boolean") data.archived = b.archived;

    const row = await prisma.project.update({ where: { id }, data });
    await writeAudit(me.id, "UPDATE", "project", id, existing, row);

    return NextResponse.json({ row });
  } catch (e) {
    return toApiError(e, t);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("finance.manage");
    const { id } = await ctx.params;

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    }

    const row = await prisma.project.update({
      where: { id },
      data: { archived: true },
    });
    await writeAudit(me.id, "UPDATE", "project", id, existing, {
      ...existing,
      archived: true,
    });

    return NextResponse.json({ row });
  } catch (e) {
    return toApiError(e, t);
  }
}
