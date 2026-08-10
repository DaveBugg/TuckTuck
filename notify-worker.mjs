// Воркер напоминаний. Отдельный контейнер из того же образа, другая команда:
//   docker compose --profile workers up -d tucktuck-notify
//
// Почему не cron на хосте: ТЗ просило «через докер всё», и воркер должен
// подниматься и падать вместе со стеком, а не жить отдельной жизнью в crontab,
// про который через полгода никто не вспомнит.
//
// Логика рассылки — в src/lib/notify.ts, здесь только расписание и живучесть.
// Скрипт вызывает собранный маршрут приложения по HTTP, а не импортирует
// Prisma напрямую: так воркеру не нужен ни свой клиент БД, ни доступ к базе —
// достаточно сети до контейнера приложения.

const APP = process.env.TUCKTUCK_INTERNAL_URL || "http://tucktuck:3000";
const TOKEN = process.env.TUCKTUCK_WORKER_TOKEN || "";

// Два расписания, а не одно.
//
// Метрики панели снимаются раз в минуту — так же, как их шлют агенты. Это не
// вкусовщина: «молчит» считается через три интервала агента, и при съёме раз в
// пять минут сервер самой панели постоянно висел бы в статусе «молчит», хотя с
// ним всё в порядке. Ровно это и происходило.
//
// Напоминания живут по своему интервалу: рассылать их чаще раза в пять минут
// незачем, а повторную отправку всё равно отсекает БД.
const METRICS_EVERY_MS = 60_000;
const NOTIFY_EVERY_MS = Math.max(30, Number(process.env.NOTIFY_INTERVAL_SEC || 60)) * 1000;

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function post(path) {
  const res = await fetch(`${APP}${path}`, {
    method: "POST",
    headers: { "X-Worker-Token": TOKEN },
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${body.error || ""}`.trim());
  return body;
}

let lastNotify = 0;

async function tick() {
  // Задачи независимы: падение одной не должно отменять другую.
  try {
    await post("/api/monitoring/self");
  } catch (e) {
    log("метрики панели не сняты:", e?.message || e);
  }

  await maybeRollup();

  if (Date.now() - lastNotify < NOTIFY_EVERY_MS) return;
  lastNotify = Date.now();
  try {
    const body = await post("/api/notify/run");
    // Пишем только когда что-то произошло: иначе лог за сутки — 288 строк «0 0 0».
    if (body.sent || body.failed || body.checked) {
      log(`проверено ${body.checked}, отправлено ${body.sent}, пропущено ${body.skipped}, ошибок ${body.failed}`);
    }
  } catch (e) {
    // Сеть моргнула или приложение перезапускается — не падаем, ждём следующий тик.
    log("тик не удался:", e?.message || e);
  }
}

// Свёртка метрик — раз в час: она перелопачивает историю целиком, и делать это
// каждую минуту незачем. Первый прогон сразу после старта, чтобы не ждать час
// на свежей установке.
let lastRollup = 0;
const ROLLUP_EVERY_MS = 3600_000;

async function maybeRollup() {
  if (Date.now() - lastRollup < ROLLUP_EVERY_MS) return;
  lastRollup = Date.now();
  try {
    const r = await post("/api/monitoring/rollup");
    if (r.hourly || r.daily || r.rawDeleted || r.oldDeleted) {
      log(`свёртка: часовых ${r.hourly}, суточных ${r.daily}, удалено сырых ${r.rawDeleted}, старых ${r.oldDeleted}`);
    }
  } catch (e) {
    log("свёртка не удалась:", e?.message || e);
  }
}

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    log(`получен ${sig}, останавливаюсь`);
    stopping = true;
    // Второй сигнал — выходим немедленно: если тик завис, ждать нечего.
    process.on(sig, () => process.exit(0));
  });
}

log(
  `воркер запущен: метрики раз в ${METRICS_EVERY_MS / 1000} с, ` +
    `напоминания раз в ${NOTIFY_EVERY_MS / 1000} с, цель ${APP}`
);

// Первый тик с задержкой: при старте стека приложение ещё поднимается, и
// мгновенный запрос гарантированно упал бы в лог ошибкой.
await new Promise(r => setTimeout(r, 15_000));

while (!stopping) {
  await tick();
  // Сон нарезан секундами, чтобы SIGTERM не ждал полного интервала.
  for (let i = 0; i < METRICS_EVERY_MS / 1000 && !stopping; i++) {
    await new Promise(r => setTimeout(r, 1000));
  }
}

log("воркер остановлен");
process.exit(0);
