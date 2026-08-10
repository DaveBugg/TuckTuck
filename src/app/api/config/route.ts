import { NextResponse } from "next/server";

/**
 * Публичные настройки, которые нужны экрану входа ДО авторизации.
 *
 * Отдельный эндпоинт, а не `NEXT_PUBLIC_*`: такие переменные впекаются в бандл
 * на этапе сборки, то есть тот, кто ставит панель готовым образом из GHCR, свой
 * ключ капчи задать не может вовсе — только пересобрав образ. Для селфхостеда
 * это неприемлемо: ключ должен задаваться переменной окружения при запуске.
 *
 * Здесь только то, что и так уходит в браузер: ключ сайта Turnstile публичен по
 * своей природе, секретная половина (`TURNSTILE_SECRET_KEY`) остаётся на
 * сервере и проверяется в /api/auth/login.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const siteKey =
    process.env.TURNSTILE_SITE_KEY ||
    // Сборочная переменная — запасной путь для тех, кто собирает образ сам.
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
    "";

  return NextResponse.json(
    { turnstileSiteKey: siteKey },
    // Не кешируем: между перезапусками ключ может смениться, а страница входа
    // и так открывается редко.
    { headers: { "Cache-Control": "no-store" } }
  );
}
