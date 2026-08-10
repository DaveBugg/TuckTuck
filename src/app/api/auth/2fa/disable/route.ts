import { NextResponse } from "next/server";
import { authenticator } from "otplib";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tForRequest } from "@/lib/i18n/server";

/** Выключение 2FA — только с действующим кодом. */
export async function POST(req: Request) {
  const t = tForRequest(req);
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!user.totpEnabled || !user.totpSecret) {
      return NextResponse.json({ error: t("auth.err.totpNotEnabled") }, { status: 400 });
    }
    if (!code || !authenticator.check(code, user.totpSecret)) {
      return NextResponse.json({ error: t("auth.err.badCode") }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: false, totpSecret: null },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
