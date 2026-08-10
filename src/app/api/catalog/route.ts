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
      prisma.provider.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
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
      const row =
        (await prisma.provider.findFirst({ where: { name }, select: { id: true, name: true } })) ??
        (await prisma.provider.create({ data: { name }, select: { id: true, name: true } }));
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
