import { NextResponse } from "next/server";
import { AUTH_COOKIE, USER_COOKIE, getCurrentTokenPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  // Ревокация текущей сессии (мультисессии): токен становится мёртвым сразу.
  const payload = await getCurrentTokenPayload();
  if (payload?.jti) {
    await prisma.session
      .updateMany({ where: { jti: payload.jti, revokedAt: null }, data: { revokedAt: new Date() } })
      .catch(() => {});
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set(USER_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
