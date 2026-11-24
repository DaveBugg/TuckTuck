import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/auth";
import { parseListParams, toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";
import { getRates } from "@/lib/rates";
import { getSettings } from "@/lib/settings";
import {
  parseAmount,
  parseCurrency,
  parseDate,
  parseKind,
  parseScope,
  toAmountBase,
  decimalStr,
  validationError,
} from "@/lib/finance-api";
import {
  validateScope,
  expenseStatusOnCreate,
  type ScopeValidationError,
} from "@/lib/finance";
import { writeAudit } from "@/lib/finance-audit";
import type { Prisma } from "@prisma/client";
import type { TFunc } from "@/lib/i18n/translate";

function parseBody(
  b: any,
  t: TFunc,
  displayCurrency: string,
  perUsd: Record<string, number>,
  partial = false
): Record<string, unknown> | { error: string } {
  const out: Record<string, unknown> = {};

  if (!partial || b.title !== undefined) {
    const title = typeof b.title === "string" ? b.title.trim() : "";
    if (!title) return validationError(t("finance.err.titleRequired"));
    out.title = title;
  }

  if (!partial || b.amount !== undefined) {
    const amount = parseAmount(b.amount);
    if (amount === null)
      return validationError(t("finance.err.amountRequired"));
    out.amount = decimalStr(amount);
  }

  if (!partial || b.currency !== undefined) {
    const currency = parseCurrency(b.currency);
    if (!currency) return validationError(t("finance.err.currencyRequired"));
    out.currency = currency;
  }

  if (b.description !== undefined) {
    out.description =
      typeof b.description === "string" ? b.description.trim() : "";
  }

  if (!partial || b.kind !== undefined) {
    out.kind = parseKind(b.kind) ?? "EXPENSE";
  }

  if (!partial || b.scope !== undefined) {
    const scope = parseScope(b.scope);
    if (!scope) return validationError(t("finance.err.unknownScope"));
    out.scope = scope;
  }

  if (b.projectId !== undefined) out.projectId = b.projectId || null;
  if (b.memberId !== undefined) out.memberId = b.memberId || null;

  if (b.date !== undefined) {
    if (b.date === null || b.date === "") {
      if (!partial) out.date = new Date();
    } else {
      const d = parseDate(b.date);
      if (!d) return validationError(t("finance.err.dateInvalid"));
      out.date = d;
    }
  }

  if (b.tags !== undefined) {
    out.tags = Array.isArray(b.tags)
      ? b.tags
          .filter((x: unknown): x is string => typeof x === "string")
          .map((x: string) => x.trim())
      : [];
  }

  if (b.sourceChatId !== undefined) {
    out.sourceChatId =
      typeof b.sourceChatId === "string" ? b.sourceChatId.trim() : "";
  }
  if (b.sourceMessageId !== undefined) {
    const n = Number(b.sourceMessageId);
    out.sourceMessageId = Number.isInteger(n) && n > 0 ? n : null;
  }

  // Пересчёт amountBase только при создании или если сумма/валюта менялись.
  const amountChanged = "amount" in out;
  const currencyChanged = "currency" in out;
  if (!partial && amountChanged && currencyChanged) {
    const amountNum = Number(out.amount);
    const base = toAmountBase(
      amountNum,
      String(out.currency),
      displayCurrency,
      perUsd
    );
    if (base === null) return validationError(t("finance.err.noRate"));
    out.amountBase = decimalStr(base);
  }

  // Валидация инвариантов scope/kind.
  const scope = String(out.scope ?? b.scope ?? "");
  const kind = String(out.kind ?? b.kind ?? "EXPENSE");
  const projectId = (out.projectId ?? b.projectId ?? null) as string | null;
  const memberId = (out.memberId ?? b.memberId ?? null) as string | null;
  const scopeErr = validateScope(kind, scope, projectId, memberId);
  if (scopeErr) return validationError(t("finance.err.scopeValidation"));

  return out;
}

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

    const data = parseBody(b, t, settings.displayCurrency, rates.perUsd);
    if ("error" in data) return NextResponse.json(data, { status: 400 });

    const status = expenseStatusOnCreate(
      hasPermission(me.role, "finance.approve")
    );

    const row = await prisma.expense.create({
      data: {
        ...(data as any),
        status,
        createdById: me.id,
      },
    });

    await writeAudit(me.id, "CREATE", "expense", row.id, null, {
      ...data,
      status,
      createdById: me.id,
    });

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
