import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import {
  memberBalance,
  projectBalance,
  teamBalance,
  totalPayable,
} from "@/lib/finance";

export async function GET() {
  try {
    await requirePermission("finance.view");

    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
    );

    const [
      members,
      projects,
      allIncomes,
      allDistributions,
      allExpenses,
      allPayouts,
      monthIncomes,
      monthExpenses,
      upcomingRecurring,
    ] = await Promise.all([
      prisma.teamMember.findMany({
        where: { active: true },
        select: { id: true, name: true },
      }),
      prisma.project.findMany({
        where: { archived: false },
        select: { id: true, name: true },
      }),
      prisma.income.findMany({ select: { amountBase: true } }),
      prisma.distribution.findMany({ select: { amountBase: true } }),
      prisma.expense.findMany({
        where: { kind: "EXPENSE", status: "APPROVED" },
        select: { amountBase: true, kind: true },
      }),
      prisma.expense.findMany({
        where: { kind: "PAYOUT", status: "APPROVED" },
        select: { amountBase: true, kind: true },
      }),
      prisma.income.findMany({
        where: { date: { gte: monthStart, lt: monthEnd } },
        select: { amountBase: true },
      }),
      prisma.expense.findMany({
        where: {
          kind: "EXPENSE",
          status: "APPROVED",
          date: { gte: monthStart, lt: monthEnd },
        },
        select: { amountBase: true },
      }),
      prisma.recurringExpense.findMany({
        where: { active: true },
        orderBy: { nextRunAt: "asc" },
        take: 10,
        select: {
          id: true,
          title: true,
          amount: true,
          currency: true,
          nextRunAt: true,
          scope: true,
        },
      }),
    ]);

    const teamBal = teamBalance(allIncomes, allDistributions, [
      ...allExpenses,
      ...allPayouts,
    ]);

    const memberDistributions = await Promise.all(
      members.map(async m => {
        const [dists, payouts] = await Promise.all([
          prisma.distribution.findMany({
            where: { memberId: m.id },
            select: { amountBase: true },
          }),
          prisma.expense.findMany({
            where: { kind: "PAYOUT", memberId: m.id, status: "APPROVED" },
            select: { amountBase: true },
          }),
        ]);
        return {
          memberId: m.id,
          name: m.name,
          balance: memberBalance(dists, payouts),
        };
      })
    );

    const projectBalances = await Promise.all(
      projects.map(async p => {
        const [incomes, distributions, expenses] = await Promise.all([
          prisma.income.findMany({
            where: { projectId: p.id },
            select: { amountBase: true },
          }),
          prisma.distribution.findMany({
            where: { projectId: p.id },
            select: { amountBase: true },
          }),
          prisma.expense.findMany({
            where: {
              projectId: p.id,
              kind: "EXPENSE",
              status: "APPROVED",
            },
            select: { amountBase: true, kind: true },
          }),
        ]);
        return {
          projectId: p.id,
          name: p.name,
          balance: projectBalance(incomes, distributions, expenses),
        };
      })
    );

    return NextResponse.json({
      teamBalance: teamBal,
      payable: totalPayable(memberDistributions.map(m => m.balance)),
      monthIncome: monthIncomes.reduce(
        (acc, x) => acc + Number(x.amountBase),
        0
      ),
      monthExpense: monthExpenses.reduce(
        (acc, x) => acc + Number(x.amountBase),
        0
      ),
      members: memberDistributions,
      projects: projectBalances,
      upcomingRecurring: upcomingRecurring.map(r => ({
        ...r,
        amount: r.amount.toString(),
        nextRunAt: r.nextRunAt.toISOString(),
      })),
    });
  } catch (e) {
    return toApiError(e);
  }
}
