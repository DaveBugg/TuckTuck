// Seed: первый ADMIN. Идемпотентно — если email уже есть, ничего не делает.
// Переопределяется через SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD; иначе пароль
// генерируется случайно и печатается ОДИН раз — сохраните его.
//
// Обычный .mjs, а не .ts под tsx: этот скрипт должен запускаться и на сервере,
// внутри рантайм-образа, где из зависимостей есть только то, что затрассировал
// Next (@prisma/client и bcryptjs — есть, tsx — нет).
//   docker compose exec tucktuck node prisma/seed.mjs
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@tucktuck.local").toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] ${email} уже существует — пропускаю`);
    return;
  }

  // Второй admin руками не заводится: если активный админ уже есть, а этого
  // email нет, это почти наверняка опечатка в SEED_ADMIN_EMAIL, а не намерение.
  const admins = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
  if (admins > 0) {
    console.log(`[seed] активный админ уже есть (${admins}) — ${email} не создаю`);
    return;
  }

  const generated = !process.env.SEED_ADMIN_PASSWORD;
  const password = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");

  await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash(password, 10), name: "Admin", role: "ADMIN" },
  });

  console.log(`[seed] создан ADMIN ${email}`);
  if (generated) console.log(`[seed] пароль (сохраните сейчас, больше не покажем): ${password}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
