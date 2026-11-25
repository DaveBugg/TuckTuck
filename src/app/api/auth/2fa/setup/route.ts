import { NextResponse } from "next/server";
import { generateSecret, generateSync, verifySync, generateURI } from "otplib";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tForRequest } from "@/lib/i18n/server";

/** Шаг 1: генерим секрет (2FA ещё НЕ включён — включает verify). */
export async function POST(req: Request) {
  const t = tForRequest(req);
  try {
    const user = await requireUser();
    if (user.totpEnabled) {
      return NextResponse.json(
        { error: t("auth.err.totpAlreadyEnabled") },
        { status: 400 }
      );
    }
    const secret = generateSecret();
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: secret },
    });
    return NextResponse.json({
      secret,
      otpauthUrl: generateURI({
        issuer: "TuckTuck",
        label: user.email,
        secret,
      }),
    });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
