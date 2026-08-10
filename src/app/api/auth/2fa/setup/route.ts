import { NextResponse } from "next/server";
import { authenticator } from "otplib";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tForRequest } from "@/lib/i18n/server";

/** Шаг 1: генерим секрет (2FA ещё НЕ включён — включает verify). */
export async function POST(req: Request) {
  const t = tForRequest(req);
  try {
    const user = await requireUser();
    if (user.totpEnabled) {
      return NextResponse.json({ error: t("auth.err.totpAlreadyEnabled") }, { status: 400 });
    }
    const secret = authenticator.generateSecret();
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
    return NextResponse.json({
      secret,
      otpauthUrl: authenticator.keyuri(user.email, "TuckTuck", secret),
    });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
