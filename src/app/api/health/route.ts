// Публичный health-check: docker healthcheck и скрипт деплоя.
//
// НАМЕРЕННО без авторизации — его дёргает докер изнутри контейнера и деплой-
// скрипт до того, как трафик переключён. Поэтому наружу не отдаётся ничего,
// чего не знает анонимный посетитель: ни версии Postgres, ни текста ошибки,
// ни DSN. Только «живой/нет» и версия сборки — по ней скрипт обновления
// убеждается, что поднялся именно новый образ, а не рестартнулся старый.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Иначе Next пререндерит роут в статику на этапе сборки, и проверка навсегда
// застынет в состоянии на момент билда.
export const dynamic = "force-dynamic";

export async function GET() {
  const version = process.env.APP_VERSION || "dev";
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  return NextResponse.json({ ok: db, version, db }, { status: db ? 200 : 503 });
}
