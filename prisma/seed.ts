// Seed: первый ADMIN. Идемпотентно — если email уже есть, ничего не делает.
// Переопределяется через SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD; иначе пароль
// генерируется случайно и печатается ОДИН раз — сохраните его.
//
// Prisma 7: клиент генерируется в src/generated/prisma, запуск через tsx
// (локально) либо из скомпилированного образа (Docker).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@tucktuck.local")
    .toLowerCase()
    .trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] ${email} уже существует — пропускаю`);
    return;
  }

  // Второй admin руками не заводится: если активный админ уже есть, а этого
  // email нет, это почти наверняка опечатка в SEED_ADMIN_EMAIL, а не намерение.
  const admins = await prisma.user.count({
    where: { role: "ADMIN", isActive: true },
  });
  if (admins > 0) {
    console.log(
      `[seed] активный админ уже есть (${admins}) — ${email} не создаю`
    );
    return;
  }

  const generated = !process.env.SEED_ADMIN_PASSWORD;
  const password =
    process.env.SEED_ADMIN_PASSWORD ||
    crypto.randomBytes(9).toString("base64url");

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      name: "Admin",
      role: "ADMIN",
    },
  });

  console.log(`[seed] создан ADMIN ${email}`);
  if (generated)
    console.log(
      `[seed] пароль (сохраните сейчас, больше не покажем): ${password}`
    );
  return user;
}

// Dev-данные Finance Board. Идемпотентно: если проект "VPN Service" уже есть,
// считаем, что сид финансов уже выполнялся. Не запускается в production,
// если не передан флаг SEED_FINANCE=1.
async function seedFinance() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.SEED_FINANCE !== "1"
  ) {
    console.log("[seed] dev-финансы пропускаются в production");
    return;
  }

  const existing = await prisma.project.findUnique({
    where: { name: "VPN Service" },
  });
  if (existing) {
    console.log("[seed] dev-финансы уже есть — пропускаю");
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
  });
  if (!admin) {
    console.log("[seed] нет активного admin — dev-финансы не создаю");
    return;
  }

  const [alice, bob, charlie, dave] = await Promise.all([
    prisma.teamMember.create({
      data: { name: "Alice", position: "Founder", userId: admin.id },
    }),
    prisma.teamMember.create({ data: { name: "Bob", position: "DevOps" } }),
    prisma.teamMember.create({
      data: { name: "Charlie", position: "Developer" },
    }),
    prisma.teamMember.create({ data: { name: "Dave", position: "Support" } }),
  ]);

  const [vpnProject, gameProject] = await Promise.all([
    prisma.project.create({
      data: {
        name: "VPN Service",
        description: "VPN-подписки и инфраструктура",
      },
    }),
    prisma.project.create({
      data: {
        name: "Gaming Project",
        description: "Игровой сервер и платежи игроков",
      },
    }),
  ]);

  await prisma.projectMember.createMany({
    data: [
      { projectId: vpnProject.id, memberId: alice.id, percent: 35 },
      { projectId: vpnProject.id, memberId: bob.id, percent: 25 },
      { projectId: vpnProject.id, memberId: charlie.id, percent: 20 },
      { projectId: vpnProject.id, memberId: dave.id, percent: 20 },
      { projectId: gameProject.id, memberId: alice.id, percent: 50 },
      { projectId: gameProject.id, memberId: bob.id, percent: 50 },
    ],
  });

  // amountBase равен amount для дев-данных: приемлемая заглушка, пока не
  // подключена реальная конвертация через rates.ts.
  const now = new Date();
  await prisma.expense.createMany({
    data: [
      {
        kind: "EXPENSE",
        status: "APPROVED",
        title: "Серверы VPN",
        amount: 200,
        currency: "USD",
        amountBase: 200,
        date: now,
        scope: "PROJECT",
        projectId: vpnProject.id,
        tags: ["infra"],
        createdById: admin.id,
      },
      {
        kind: "EXPENSE",
        status: "APPROVED",
        title: "Офисные расходы",
        amount: 5000,
        currency: "RUB",
        amountBase: 5000,
        date: now,
        scope: "TEAM",
        tags: ["office"],
        createdById: admin.id,
      },
      {
        kind: "PAYOUT",
        status: "APPROVED",
        title: "Выплата Charlie",
        amount: 10000,
        currency: "RUB",
        amountBase: 10000,
        date: now,
        scope: "MEMBER",
        memberId: charlie.id,
        createdById: admin.id,
        approvedById: admin.id,
        approvedAt: now,
      },
      {
        kind: "EXPENSE",
        status: "PENDING",
        title: "Реклама",
        amount: 150,
        currency: "USD",
        amountBase: 150,
        date: now,
        scope: "PROJECT",
        projectId: gameProject.id,
        tags: ["ads"],
        createdById: admin.id,
      },
    ],
  });

  await prisma.income.createMany({
    data: [
      {
        title: "Платёж клиента VPN",
        amount: 1000,
        currency: "USD",
        amountBase: 1000,
        date: now,
        projectId: vpnProject.id,
        createdById: admin.id,
      },
      {
        title: "Донаты игроков",
        amount: 30000,
        currency: "RUB",
        amountBase: 30000,
        date: now,
        projectId: gameProject.id,
        createdById: admin.id,
      },
      {
        title: "Пополнение кассы",
        amount: 500,
        currency: "USD",
        amountBase: 500,
        date: now,
        createdById: admin.id,
      },
    ],
  });

  console.log(
    "[seed] созданы dev-финансы (проекты, тиммейты, расходы, доходы)"
  );
}

async function main() {
  await seedAdmin();
  await seedFinance();
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
