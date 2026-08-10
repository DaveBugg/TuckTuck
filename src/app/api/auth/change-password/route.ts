import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { AuthError, getCurrentTokenPayload, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tForRequest } from "@/lib/i18n/server";

export async function POST(req: Request) {
  const t = tForRequest(req);
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const oldPassword = typeof body.oldPassword === "string" ? body.oldPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!oldPassword || !newPassword) {
      return NextResponse.json({ error: t("auth.err.passwordsRequired") }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: t("auth.err.passwordTooShort") }, { status: 400 });
    }
    if (!(await bcrypt.compare(oldPassword, user.passwordHash))) {
      return NextResponse.json({ error: t("auth.err.oldPasswordWrong") }, { status: 401 });
    }

    const payload = await getCurrentTokenPayload();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(newPassword, 10) },
      }),
      // Смена пароля выбивает все ОСТАЛЬНЫЕ сессии.
      prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null, NOT: { jti: payload?.jti || "" } },
        data: { revokedAt: new Date() },
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
