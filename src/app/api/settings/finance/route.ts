import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";
import { getSettings, invalidateSettingsCache } from "@/lib/settings";

const MAX_CURRENCIES = 12;
const MAX_TAGS = 8;

function validateStringArray(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value
    .filter((x): x is string => typeof x === "string")
    .map(x => x.trim())
    .filter(Boolean);
  if (out.length > max) return null;
  return out;
}

function isUuid(v: unknown): boolean {
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
}

async function readFinanceSettings(t: ReturnType<typeof tForRequest>) {
  const settings = await prisma.appSettings.findUnique({
    where: { id: "singleton" },
  });
  const currencies = Array.isArray(settings?.financeQuickCurrencies)
    ? settings!.financeQuickCurrencies
    : [];
  const tags = Array.isArray(settings?.financeQuickTags)
    ? settings!.financeQuickTags
    : [];

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      telegramUserId: { not: null },
    },
    select: {
      id: true,
      name: true,
      email: true,
      telegramUserId: true,
    },
    orderBy: { name: "asc" },
  });

  return {
    financeQuickCurrencies: currencies,
    financeQuickTags: tags,
    financierUserId: settings?.financierUserId ?? null,
    financierOptions: users.map(u => ({
      id: u.id,
      name: u.name || u.email,
      telegramUserId: String(u.telegramUserId),
    })),
  };
}

export async function GET(req: Request) {
  const t = tForRequest(req);
  try {
    await requirePermission("finance.admin");
    return NextResponse.json(await readFinanceSettings(t));
  } catch (e) {
    return toApiError(e, t);
  }
}

export async function PATCH(req: Request) {
  const t = tForRequest(req);
  try {
    await requirePermission("finance.admin");
    const b = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};

    if (b.financeQuickCurrencies !== undefined) {
      const currencies = validateStringArray(
        b.financeQuickCurrencies,
        MAX_CURRENCIES
      );
      if (currencies === null) {
        return NextResponse.json(
          {
            error: t("finance.settings.err.currencies", {
              max: MAX_CURRENCIES,
            }),
          },
          { status: 400 }
        );
      }
      data.financeQuickCurrencies = currencies;
    }

    if (b.financeQuickTags !== undefined) {
      const tags = validateStringArray(b.financeQuickTags, MAX_TAGS);
      if (tags === null) {
        return NextResponse.json(
          { error: t("finance.settings.err.tags", { max: MAX_TAGS }) },
          { status: 400 }
        );
      }
      data.financeQuickTags = tags;
    }

    if (b.financierUserId !== undefined) {
      if (b.financierUserId === null) {
        data.financierUserId = null;
      } else if (isUuid(b.financierUserId)) {
        const exists = await prisma.user.findUnique({
          where: { id: b.financierUserId },
          select: { id: true },
        });
        if (!exists) {
          return NextResponse.json(
            { error: t("err.relationNotFound") },
            { status: 400 }
          );
        }
        data.financierUserId = b.financierUserId;
      } else {
        return NextResponse.json(
          { error: t("err.relationNotFound") },
          { status: 400 }
        );
      }
    }

    if (Object.keys(data).length) {
      await prisma.appSettings.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", ...data },
        update: data,
      });
    }

    await invalidateSettingsCache();
    return NextResponse.json(await readFinanceSettings(t));
  } catch (e) {
    return toApiError(e, t);
  }
}
