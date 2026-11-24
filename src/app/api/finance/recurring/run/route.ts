import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { getRates } from "@/lib/rates";
import { getSettings } from "@/lib/settings";
import { createExpense } from "@/lib/finance-service";
import { writeAudit } from "@/lib/finance-audit";
import { toAmountBase, decimalStr } from "@/lib/finance-api";
import {
  dueTemplates,
  nextRunAfter,
  buildExpenseFromTemplate,
} from "@/lib/finance-recurring";

function workerAuthorized(req: Request): boolean {
  const expected = process.env.TUCKTUCK_WORKER_TOKEN || "";
  if (!expected) return false;
  const got = req.headers.get("x-worker-token") || "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeDate(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

export async function POST(req: Request) {
  try {
    const me = workerAuthorized(req)
      ? null
      : await requirePermission("finance.manage");

    const now = new Date();
    const settings = await getSettings();
    const rates = await getRates();

    const templates = await prisma.recurringExpense.findMany({
      where: { active: true },
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
      },
    });

    const due = dueTemplates(templates, now);

    const creatorIds = Array.from(
      new Set(due.map(t => t.createdById).filter(Boolean))
    ) as string[];
    const creators = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
    });
    const creatorById = new Map(creators.map(u => [u.id, u]));

    let created = 0;
    let skipped = 0;

    for (const t of due) {
      const runDate = normalizeDate(t.nextRunAt);

      const existing = await prisma.expense.findFirst({
        where: {
          recurringId: t.id,
          date: runDate,
        },
      });

      if (existing) {
        skipped++;
      } else {
        const creator = t.createdById ? creatorById.get(t.createdById) : null;
        if (!creator) {
          console.warn(
            `[recurring/run] creator not found for template ${t.id}`
          );
          skipped++;
        } else {
          const base = toAmountBase(
            Number(t.amount),
            t.currency,
            settings.displayCurrency,
            rates.perUsd
          );
          if (base === null) {
            console.warn(
              `[recurring/run] no rate for ${t.currency} (template ${t.id})`
            );
            skipped++;
          } else {
            const data = buildExpenseFromTemplate(t);
            await createExpense({
              me: creator,
              data: {
                ...data,
                amountBase: decimalStr(base),
                tags: data.tags,
              },
              forceStatus: "APPROVED",
            });
            created++;
          }
        }
      }

      let nextRun = t.nextRunAt;
      while (nextRun <= now) {
        nextRun = nextRunAfter(nextRun, t.frequency, t.interval, t.dayOfMonth);
      }

      await prisma.recurringExpense.update({
        where: { id: t.id },
        data: { nextRunAt: nextRun },
      });
    }

    await writeAudit(me?.id ?? null, "GENERATE", "recurring", "run", null, {
      created,
      skipped,
      templates: due.length,
      at: now.toISOString(),
    });

    return NextResponse.json({ created, skipped });
  } catch (e) {
    return toApiError(e);
  }
}
