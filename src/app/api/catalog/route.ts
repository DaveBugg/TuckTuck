import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";

/**
 * Справочники для формы ресурса одним запросом: провайдеры, теги, группы.
 *
 * Один эндпоинт, а не три: форма всё равно открывается со всеми тремя списками
 * сразу, и три параллельных round-trip'а ради десятка строк — лишний код на
 * клиенте и лишние спиннеры в интерфейсе.
 */
export async function GET() {
  try {
    await requirePermission("resources.view");
    const [providers, tags, groups] = await prisma.$transaction([
      prisma.provider.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, url: true },
      }),
      prisma.tag.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, color: true },
      }),
      prisma.group.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    return NextResponse.json({ providers, tags, groups });
  } catch (e) {
    return toApiError(e);
  }
}

/**
 * Быстрое заведение провайдера или тега прямо из формы ресурса (ТЗ: «добавляется
 * быстро как тег»). Возвращает существующую запись, если имя уже занято, —
 * пользователь набрал то же самое, и ошибка «уже существует» была бы для него
 * бессмысленной: он хотел выбрать, а не создать.
 */
/**
 * Адрес сайта провайдера. Пустая строка — «ссылки нет», это нормально.
 * null — прислали мусор.
 *
 * Схему добавляем сами: человек копирует «example.com» из адресной строки чаще,
 * чем «https://example.com», а ссылка без схемы в href ведёт на путь внутри
 * панели, а не наружу.
 */
function normalizeSiteUrl(v: unknown): string | null {
  if (v === undefined || v === null) return "";
  const raw = String(v).trim();
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    // Только http(s): javascript: в ссылке на «сайт провайдера» — это XSS.
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const t = tForRequest(req);
  try {
    await requirePermission("catalog.manage");
    const b = await req.json().catch(() => ({}));
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) return NextResponse.json({ error: t("catalog.err.nameRequired") }, { status: 400 });
    if (name.length > 64) {
      return NextResponse.json({ error: t("catalog.err.nameTooLong") }, { status: 400 });
    }

    if (b.type === "provider") {
      const url = normalizeSiteUrl(b.url);
      if (url === null) return NextResponse.json({ error: t("catalog.err.badUrl") }, { status: 400 });
      const existing = await prisma.provider.findFirst({
        where: { name },
        select: { id: true, name: true, url: true },
      });
      // Заводили уже — только дописываем ссылку, если её прислали и не было.
      const row = existing
        ? url && !existing.url
          ? await prisma.provider.update({
              where: { id: existing.id },
              data: { url },
              select: { id: true, name: true, url: true },
            })
          : existing
        : await prisma.provider.create({
            data: { name, url },
            select: { id: true, name: true, url: true },
          });
      return NextResponse.json({ row }, { status: 201 });
    }
    if (b.type === "tag") {
      const color = typeof b.color === "string" ? b.color.trim() : "";
      const row =
        (await prisma.tag.findFirst({
          where: { name },
          select: { id: true, name: true, color: true },
        })) ??
        (await prisma.tag.create({
          data: { name, color },
          select: { id: true, name: true, color: true },
        }));
      return NextResponse.json({ row }, { status: 201 });
    }
    return NextResponse.json({ error: t("catalog.err.unknownKind") }, { status: 400 });
  } catch (e) {
    return toApiError(e, t);
  }
}

/** Правка справочника. Пока только ссылка провайдера — остальное меняют редко. */
export async function PATCH(req: Request) {
  const t = tForRequest(req);
  try {
    await requirePermission("catalog.manage");
    const b = await req.json().catch(() => ({}));
    if (b.type !== "provider" || typeof b.id !== "string" || !b.id) {
      return NextResponse.json({ error: t("catalog.err.unknownKind") }, { status: 400 });
    }
    const url = normalizeSiteUrl(b.url);
    if (url === null) return NextResponse.json({ error: t("catalog.err.badUrl") }, { status: 400 });
    const row = await prisma.provider.update({
      where: { id: b.id },
      data: { url },
      select: { id: true, name: true, url: true },
    });
    return NextResponse.json({ row });
  } catch (e) {
    return toApiError(e, t);
  }
}
