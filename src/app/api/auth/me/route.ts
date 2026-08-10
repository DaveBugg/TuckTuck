import { NextResponse } from "next/server";
import { AuthError, publicUser, requireUser, USER_COOKIE, TOKEN_TTL_SEC } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/lib/i18n/config";
import { tForRequest } from "@/lib/i18n/server";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ user: publicUser(user), totpEnabled: user.totpEnabled });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Настройки самого пользователя. Пока это только язык.
 *
 * Язык одновременно кладётся в куку: она — быстрый путь для рендера, база
 * нужна, чтобы выбор пережил вход с другого устройства. Если записать только
 * одно из двух, они разъедутся, и человек будет менять язык дважды.
 */
export async function PATCH(req: Request) {
  const t = tForRequest(req);
  try {
    const user = await requireUser();
    const b = await req.json().catch(() => ({}));

    if (!isLocale(b.locale)) {
      return NextResponse.json({ error: t("settings.err.unknownLocale") }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { locale: b.locale },
    });

    const res = NextResponse.json({ user: publicUser(updated) });
    const secure = process.env.NODE_ENV === "production";
    res.cookies.set(LOCALE_COOKIE, b.locale, {
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
    });
    // В tt_user язык тоже входит — иначе клиент увидит расхождение и решит,
    // что куку языка пора «починить» обратно на старую.
    res.cookies.set(USER_COOKIE, JSON.stringify(publicUser(updated)), {
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: TOKEN_TTL_SEC,
    });
    return res;
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
