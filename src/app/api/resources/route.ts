import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { parseListParams, toApiError } from "@/lib/list-query";
import { visibilityWhere, KINDS, PERIOD_UNITS, CURRENCIES, CHAINS } from "@/lib/resources";
import type { Prisma } from "@prisma/client";
import { tForRequest } from "@/lib/i18n/server";
import type { TFunc } from "@/lib/i18n/translate";

/** Разбор тела формы. Общий для создания и правки — правила валидации одни. */
function parseBody(b: any, t: TFunc, partial = false) {
  const out: Record<string, unknown> = {};
  const err = (m: string) => ({ error: m });

  if (!partial || b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) return err(t("res.err.nameRequired"));
    out.name = name;
  }
  if (!partial || b.kind !== undefined) {
    if (!KINDS.includes(b.kind)) return err(t("res.err.unknownKind"));
    out.kind = b.kind;
  }
  if (!partial || b.amount !== undefined) {
    const amount = Number(b.amount);
    if (!isFinite(amount) || amount < 0) return err(t("res.err.amountNegative"));
    // 8 знаков, а не 2: 0.00042 BTC — обычная сумма, округление до копеек
    // превратило бы её в ноль.
    out.amount = amount.toFixed(8);
  }
  if (b.isCrypto !== undefined) out.isCrypto = !!b.isCrypto;
  if (b.currency !== undefined) {
    const c = String(b.currency).trim().toUpperCase();
    // Whitelist: опечатка в коде валюты тихо ломает пересчёт итога — курса для
    // «USDD» не найдётся, и ресурс молча выпал бы из общей суммы.
    if (c && !CURRENCIES.includes(c as any)) return err(t("res.err.unknownCurrency", { code: c }));
    if (c) out.currency = c;
  }
  if (b.chain !== undefined) {
    const c = String(b.chain).trim().toUpperCase();
    if (c && !CHAINS.includes(c as any)) return err(t("res.err.unknownChain", { code: c }));
    out.chain = c;
  }
  if (!partial || b.nextPaymentAt !== undefined) {
    // Дата приходит как "ГГГГ-ММ-ДД" и кладётся в @db.Date. Собираем UTC-полночь
    // явно: new Date("2026-08-10") уже UTC, а вот new Date(2026,7,10) — местная,
    // и в минусовых поясах уехала бы на сутки назад.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b.nextPaymentAt || ""));
    if (!m) return err(t("res.err.dateRequired"));
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (isNaN(d.getTime())) return err(t("res.err.dateInvalid"));
    out.nextPaymentAt = d;
  }
  if (!partial || b.periodValue !== undefined) {
    const v = parseInt(b.periodValue, 10);
    if (!isFinite(v) || v < 1) return err(t("res.err.periodValue"));
    out.periodValue = v;
  }
  if (!partial || b.periodUnit !== undefined) {
    if (!PERIOD_UNITS.includes(b.periodUnit)) return err(t("res.err.periodUnit"));
    out.periodUnit = b.periodUnit;
  }

  for (const f of ["note", "ip", "url", "domain"] as const) {
    if (b[f] !== undefined) out[f] = typeof b[f] === "string" ? b[f].trim() : "";
  }
  if (b.port !== undefined) {
    if (b.port === null || b.port === "") out.port = null;
    else {
      const p = parseInt(b.port, 10);
      if (!isFinite(p) || p < 1 || p > 65535) return err(t("res.err.portRange"));
      out.port = p;
    }
  }
  if (b.providerId !== undefined) out.providerId = b.providerId || null;
  if (b.groupId !== undefined) out.groupId = b.groupId || null;
  if (b.isActive !== undefined) out.isActive = !!b.isActive;
  return out;
}

export async function GET(req: Request) {
  try {
    const me = await requirePermission("resources.view");
    const p = parseListParams(req.url, {
      // Главный экран из ТЗ — «что скоро оплачивать», поэтому по умолчанию
      // сортировка по дате ВОЗРАСТАЮЩАЯ: ближайшие платежи сверху.
      sortable: ["name", "kind", "nextPaymentAt", "amount", "createdAt"],
      defaultSort: "nextPaymentAt",
      defaultOrder: "asc",
    });

    const kind = p.get("kind");
    const providerId = p.get("providerId");
    const tagId = p.get("tagId");
    const due = p.get("due"); // 3 | 7 | 14 — «оплатить в ближайшие N дней»

    const where: Prisma.ResourceWhereInput = {
      ...visibilityWhere(me),
      ...(KINDS.includes(kind as any) ? { kind: kind as any } : {}),
      ...(providerId ? { providerId } : {}),
      ...(tagId ? { tags: { some: { tagId } } } : {}),
      ...(p.search
        ? {
            OR: [
              { name: { contains: p.search, mode: "insensitive" as const } },
              { ip: { contains: p.search, mode: "insensitive" as const } },
              { domain: { contains: p.search, mode: "insensitive" as const } },
              { url: { contains: p.search, mode: "insensitive" as const } },
              { note: { contains: p.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    if (["3", "7", "14"].includes(due)) {
      // Верхняя граница — конец N-го дня. Нижней нет намеренно: просроченное
      // тоже «нужно оплатить», и прятать его из этого фильтра было бы опасно.
      const to = new Date();
      to.setUTCHours(0, 0, 0, 0);
      to.setUTCDate(to.getUTCDate() + parseInt(due, 10));
      where.nextPaymentAt = { lte: to };
    }

    const [rows, total] = await prisma.$transaction([
      prisma.resource.findMany({
        where,
        orderBy: { [p.sort]: p.order },
        skip: p.skip,
        take: p.take,
        select: {
          id: true,
          kind: true,
          name: true,
          ip: true,
          port: true,
          url: true,
          domain: true,
          note: true,
          amount: true,
          currency: true,
          isCrypto: true,
          chain: true,
          periodValue: true,
          periodUnit: true,
          nextPaymentAt: true,
          isActive: true,
          agentToken: true,
          isSelf: true,
          // Адресные поля SSH — чтобы форма повторной установки не заставляла
          // вводить их заново. Ключа среди них нет: он не хранится.
          sshHost: true,
          sshPort: true,
          sshUser: true,
          sshFingerprint: true,
          provider: { select: { id: true, name: true, url: true } },
          group: { select: { id: true, name: true } },
          tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
        },
      }),
      prisma.resource.count({ where }),
    ]);

    return NextResponse.json({
      // Decimal не сериализуется в JSON сам — отдаём строкой, чтобы не потерять
      // копейки на float. Дату отдаём как ГГГГ-ММ-ДД: это @db.Date, времени в
      // ней нет, и ISO-строка с 00:00:00Z только провоцировала бы сдвиг пояса.
      rows: rows.map(r => ({
        ...r,
        amount: r.amount.toString(),
        nextPaymentAt: r.nextPaymentAt.toISOString().slice(0, 10),
        tags: r.tags.map(rt => rt.tag),
        // Сам токен наружу не отдаём — только факт, что агент подключён.
        agentToken: undefined,
        agentConnected: !!r.agentToken,
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
    const me = await requirePermission("resources.manage");
    const b = await req.json().catch(() => ({}));
    const data = parseBody(b, t);
    if ((data as any).error) return NextResponse.json(data, { status: 400 });

    const tagIds: string[] = Array.isArray(b.tagIds) ? b.tagIds.filter(Boolean) : [];
    // По ТЗ при заведении ресурса напоминания ставятся сразу: за 2 суток и за
    // сутки. Форма может прислать свой набор — тогда берём его.
    const days: number[] = Array.isArray(b.reminderDays) ? b.reminderDays : [2, 1];
    const uniqueDays = [...new Set(days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 365))];

    const row = await prisma.resource.create({
      data: {
        ...(data as any),
        createdById: me.id,
        tags: { create: tagIds.map(tagId => ({ tagId })) },
        reminders: { create: uniqueDays.map(daysBefore => ({ daysBefore })) },
      },
      select: { id: true, name: true, kind: true },
    });
    return NextResponse.json({ row }, { status: 201 });
  } catch (e) {
    return toApiError(e, t);
  }
}
