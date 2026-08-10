// Разовая проверка механики SSH-установки: подключение, TOFU-отпечаток,
// доставка скрипта через stdin, heredoc с агентом, стрим вывода, код выхода.
//
// Вместо install.sh подставляется безобидный скрипт: проверяем транспорт, а не
// установку — install.sh уже обкатан на живом сервере.
//
//   npx tsx scripts/ssh-smoke.mjs <host> <user> <путь-к-ключу> [порт]

import { readFileSync } from "fs";

const [host, user, keyPath, port = "22"] = process.argv.slice(2);
if (!host || !user || !keyPath) {
  console.error("usage: node scripts/ssh-smoke.mjs <host> <user> <key> [port]");
  process.exit(2);
}

const { buildScript, normalizeKey, runInstall } = await import("../src/lib/ssh-install.ts");

const PROBE = `#!/bin/sh
set -eu
echo "os: $( . /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || uname -s )"
echo "id: $(id -un) (uid $(id -u))"
echo "агент доехал: $(wc -l < "$TUCKTUCK_AGENT_SRC") строк, первая: $(head -1 "$TUCKTUCK_AGENT_SRC")"
echo "url: $TUCKTUCK_URL"
echo "curl: $(command -v curl || echo нет), wget: $(command -v wget || echo нет)"
echo "systemd: $([ -d /run/systemd/system ] && echo да || echo нет), crontab: $(command -v crontab || echo нет)"
# stdin должен быть пуст: если бы скрипт исполнялся прямо из потока, cat вычитал
# бы его остаток и напечатал сюда.
N=$(cat | wc -c)
[ "$N" = "0" ] && echo "stdin пуст — ок" || echo "ВНИМАНИЕ: в stdin $N байт"
echo "выходим с нулём"
`;

const script = buildScript({
  url: "https://smoke.invalid",
  token: "smoke-token",
  agentSh: readFileSync("public/agent.sh", "utf8"),
  installSh: PROBE,
});

const r = await runInstall(
  {
    host,
    port: Number(port),
    user,
    privateKey: normalizeKey(readFileSync(keyPath, "utf8")),
    // EXPECT_FP=... — проверить сверку отпечатка (в том числе несовпадение).
    expectedFingerprint: process.env.EXPECT_FP || "",
    useSudo: false,
  },
  script,
  (line, s) => console.log(`[${s}] ${line}`),
  60_000
);

console.log("\nитог:", r);
process.exit(r.ok ? 0 : 1);
