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

function isPrismaUniqueError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002"
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
      where: { id: { in: creatorIds }, isActive: true },
    });
    const creatorById = new Map(creators.map(u => [u.id, u]));

    let created = 0;
    let skipped = 0;

    for (const t of due) {
      const creator = t.createdById ? creatorById.get(t.createdById) : null;
      if (!creator) {
        console.warn(
          `[recurring/run] creator missing or inactive for template ${t.id}`
        );
        skipped++;
        continue;
      }

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
        continue;
      }

      const data = buildExpenseFromTemplate(t);
      let nextRun = t.nextRunAt;
      while (nextRun <= now) {
        nextRun = nextRunAfter(nextRun, t.frequency, t.interval, t.dayOfMonth);
      }

      try {
        await prisma.$transaction(async tx => {
          await createExpense({
            me: creator,
            data: {
              ...data,
              amountBase: decimalStr(base),
              tags: data.tags,
            },
            forceStatus: "APPROVED",
            tx,
          });
          await tx.recurringExpense.update({
            where: { id: t.id },
            data: { nextRunAt: nextRun },
          });
        });
        created++;
      } catch (e) {
        if (isPrismaUniqueError(e)) {
          // Уже создано за этот период — дедуп сработал на уровне БД.
          skipped++;
        } else {
          throw e;
        }
      }
    }

    if (created > 0) {
      await writeAudit(me?.id ?? null, "GENERATE", "recurring", "run", null, {
        created,
        skipped,
        templateIds: due.map(t => t.id),
      });
    }

    return NextResponse.json({ created, skipped });
  } catch (e) {
    return toApiError(e);
  }
}
