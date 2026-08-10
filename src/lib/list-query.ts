// Хелперы для списочных CRUD-роутов: единый разбор query (?page&pageSize&sort&
// order&search&фильтры) под контракт DataTable/apiFetcher + единая обработка
// AuthError. Держит роуты тонкими и одинаковыми.
import { NextResponse } from "next/server";
import { AuthError } from "./auth";
import { makeT, type TFunc } from "./i18n/translate";
import { DEFAULT_LOCALE } from "./i18n/config";

export type ListParams = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  sort: string;
  order: "asc" | "desc";
  search: string;
  get: (key: string) => string; // произвольный фильтр из query ("" если нет)
};

export function parseListParams(
  reqUrl: string,
  opts: { sortable: string[]; defaultSort: string; defaultOrder?: "asc" | "desc"; maxPageSize?: number }
): ListParams {
  const sp = new URL(reqUrl).searchParams;
  const maxPS = opts.maxPageSize ?? 100;
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const pageSize = Math.min(maxPS, Math.max(1, parseInt(sp.get("pageSize") || "10", 10) || 10));
  const sortRaw = sp.get("sort") || opts.defaultSort;
  const sort = opts.sortable.includes(sortRaw) ? sortRaw : opts.defaultSort; // whitelist!
  const order = sp.get("order") === "asc" ? "asc" : sp.get("order") === "desc" ? "desc" : (opts.defaultOrder ?? "desc");
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    sort,
    order,
    search: (sp.get("search") || "").trim(),
    get: (key: string) => (sp.get(key) || "").trim(),
  };
}

/** Обёртка catch для API-роутов: AuthError → 401/403, unique-конфликт → 409. */
/**
 * Ошибка Prisma/авторизации → ответ API.
 *
 * t необязателен: часть обработчиков ловит исключение раньше, чем успевает
 * определить язык. Тогда берём язык по умолчанию — это лучше, чем ронять
 * обработчик ошибок из-за отсутствующего аргумента.
 */
export function toApiError(e: unknown, t: TFunc = makeT(DEFAULT_LOCALE)): NextResponse {
  if (e instanceof AuthError) {
    return NextResponse.json(
      { error: t(e.status === 401 ? "err.unauthorized" : "err.forbidden") },
      { status: e.status }
    );
  }
  const code = (e as any)?.code;
  if (code === "P2002") {
    return NextResponse.json({ error: t("err.duplicate") }, { status: 409 });
  }
  if (code === "P2025") {
    return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
  }
  if (code === "P2003") {
    return NextResponse.json({ error: t("err.relationNotFound") }, { status: 400 });
  }
  if (code === "P2023") {
    // невалидный uuid в id-поле — такой записи точно нет
    return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
  }
  // Незаданный ключ шифрования — не «внутренняя ошибка», а конфигурация,
  // которую администратор может починить. Прятать её за общим текстом значит
  // отправить человека читать логи вместо однострочной правки .env.
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("TUCKTUCK_ENCRYPTION_KEY")) {
    console.error("[api]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  console.error("[api]", e);
  return NextResponse.json({ error: t("err.internal") }, { status: 500 });
}
