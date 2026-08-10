import { NextResponse } from "next/server";
import crypto from "crypto";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { runNotify } from "@/lib/notify";

/**
 * Прогон рассылки. Два способа попасть сюда:
 *   1. воркер по расписанию — заголовком X-Worker-Token;
 *   2. админ из панели, кнопкой «отправить сейчас» — обычной сессией.
 *
 * Идемпотентно: повторный вызов в тот же день ничего не задублирует, защита
 * в ReminderDispatch (уникальность по напоминанию и дате оплаты).
 */
function workerAuthorized(req: Request): boolean {
  const expected = process.env.TUCKTUCK_WORKER_TOKEN || "";
  // Пустой токен НЕ открывает доступ: иначе забытая переменная окружения
  // превращала бы эндпоинт в публичный.
  if (!expected) return false;
  const got = req.headers.get("x-worker-token") || "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  // Сравнение за постоянное время: длина всё равно утекает, но побайтовый
  // подбор значения — нет.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  try {
    if (!workerAuthorized(req)) await requirePermission("notify.manage");
    return NextResponse.json(await runNotify());
  } catch (e) {
    return toApiError(e);
  }
}
