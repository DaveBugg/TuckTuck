import { NextResponse } from "next/server";
import { authenticator } from "otplib";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tForRequest } from "@/lib/i18n/server";

/** Шаг 2: код с устройства подтверждён → 2FA включён. */
export async function POST(req: Request) {
  const t = tForRequest(req);
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!user.totpSecret) {
      return NextResponse.json({ error: t("auth.err.setupFirst") }, { status: 400 });
    }
    if (!code || !authenticator.check(code, user.totpSecret)) {
      return NextResponse.json({ error: t("auth.err.badCode") }, { status: 400 });
    }
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
