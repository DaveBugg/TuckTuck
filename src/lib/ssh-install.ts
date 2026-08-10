// Установка агента мониторинга на удалённый сервер по SSH.
//
// Что здесь важно и почему именно так:
//
// 1. Приватный ключ НЕ сохраняется. Он приходит в теле запроса, живёт в памяти
//    на время установки и уходит вместе с ней. В БД остаются только адрес,
//    порт, пользователь и отпечаток хоста. Хранить чужой ключ ради удобства
//    повторной установки — размен, которого делать не стоит: панель мгновенно
//    превращается в связку ключей от всего парка.
//
// 2. Хостовый ключ проверяется по принципу TOFU, как в самом ssh: первый раз
//    запоминаем отпечаток, дальше сверяем. Сменился — обрываем. Без этого
//    подменивший сервер получил бы и токен агента, и вид «всё установилось».
//
// 3. Токен не попадает в командную строку. Скрипт целиком уходит в stdin, а
//    аргументом его не передать, не показав токен в `ps` любому пользователю
//    сервера на всё время установки.

import { Client, type ConnectConfig } from "ssh2";
import crypto from "crypto";
import type { TFunc } from "./i18n/translate";

export type InstallTarget = {
  host: string;
  port: number;
  user: string;
  /** PEM/OpenSSH/PPK — что дал пользователь. Не сохраняется никуда. */
  privateKey: string;
  passphrase?: string;
  /** Пусто — первое подключение, отпечаток запоминаем. Иначе сверяем. */
  expectedFingerprint?: string;
  /** Не root: команды пойдут через sudo -n (без пароля). */
  useSudo: boolean;
};

export type InstallResult = {
  ok: boolean;
  /** SHA256:… в формате OpenSSH — тот же, что показывает ssh при первом входе. */
  fingerprint: string;
  code: number | null;
};

/** Отпечаток хостового ключа ровно в том виде, в каком его печатает OpenSSH. */
export function hostFingerprint(key: Buffer): string {
  // base64 без «=» на конце — так это и выглядит в ssh, и человек может
  // сверить строку глазами с выводом `ssh-keyscan`.
  return "SHA256:" + crypto.createHash("sha256").update(key).digest("base64").replace(/=+$/, "");
}

/**
 * Собрать скрипт установки для передачи в stdin удалённого sh.
 *
 * Агент кладётся heredoc'ом рядом, а install.sh забирает его через
 * TUCKTUCK_AGENT_SRC. Так установка не зависит от того, дотянется ли сервер до
 * панели по HTTP прямо сейчас, и не требует curl на время установки.
 */
export function buildScript(opts: {
  url: string;
  token: string;
  agentSh: string;
  installSh: string;
}): string {
  // Одинарные кавычки в sh не интерполируют ничего, поэтому единственное, что
  // нужно экранировать, — сама одинарная кавычка.
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  return [
    `TUCKTUCK_URL=${q(opts.url)}`,
    `TUCKTUCK_TOKEN=${q(opts.token)}`,
    `export TUCKTUCK_URL TUCKTUCK_TOKEN`,
    `umask 077`,
    `TUCKTUCK_AGENT_SRC="$(mktemp)" || exit 1`,
    `export TUCKTUCK_AGENT_SRC`,
    // Делимитр в кавычках — внутри ничего не подставляется, агент уезжает
    // байт в байт.
    `cat > "$TUCKTUCK_AGENT_SRC" <<'TUCKTUCK_AGENT_EOF'`,
    opts.agentSh.replace(/\r\n/g, "\n").replace(/\n*$/, ""),
    `TUCKTUCK_AGENT_EOF`,
    // Убрать за собой в любом случае, включая падение установщика.
    `trap 'rm -f "$TUCKTUCK_AGENT_SRC"' EXIT INT TERM`,
    ``,
    opts.installSh.replace(/\r\n/g, "\n"),
    ``,
  ].join("\n");
}

/**
 * Ключ из формы: убрать CR и дописать перевод строки в конце.
 *
 * Ключ почти всегда прилетает копипастой из Windows или из textarea, а парсер
 * ssh2 на «-----END …-----» без завершающего перевода строки отвечает
 * «Cannot parse privateKey» — сообщением, по которому причину не угадать.
 */
export function normalizeKey(raw: string): string {
  const s = raw.replace(/\r\n?/g, "\n").trim();
  return s ? s + "\n" : "";
}

/**
 * Понятный текст вместо технического «All configured authentication methods failed».
 *
 * Сообщения ssh2 описывают, что произошло на уровне протокола, но не что с этим
 * делать. «Ключ не подошёл» и «порт закрыт» лечатся по-разному, и подсказать
 * это здесь дешевле, чем оставить человека гадать по логу.
 */
function friendly(err: Error & { level?: string }, t: TFunc): string {
  const m = err.message || String(err);
  if (/All configured authentication methods failed/i.test(m)) return t("ssh.err.auth");
  if (/Encrypted private key detected/i.test(m)) return t("ssh.err.encrypted");
  if (/Cannot parse privateKey|Unsupported key format/i.test(m)) return t("ssh.err.parse");
  if (/ETIMEDOUT|Timed out while waiting/i.test(m)) return t("ssh.err.timeout");
  if (/ECONNREFUSED/i.test(m)) return t("ssh.err.refused");
  if (/ENOTFOUND|EAI_AGAIN/i.test(m)) return t("ssh.err.dns");
  return m;
}

/**
 * Подключиться, выполнить установку, отдавая вывод построчно в onLine.
 *
 * Никогда не бросает: результат — это {ok,code} плюс строки лога, потому что
 * вызывающий стримит их пользователю и должен уметь показать неудачу так же
 * спокойно, как удачу.
 */
export function runInstall(
  target: InstallTarget,
  script: string,
  onLine: (line: string, stream: "out" | "err" | "sys") => void,
  t: TFunc,
  timeoutMs = 240_000
): Promise<InstallResult> {
  return new Promise<InstallResult>(resolve => {
    const conn = new Client();
    let fingerprint = "";
    let settled = false;

    // Токен виден только серверу. Если он всё же просочится в вывод (чужой
    // скрипт, set -x, отладка), в лог он не попадёт.
    const secret = /TUCKTUCK_TOKEN=\S+/g;
    const line = (text: string, s: "out" | "err" | "sys") =>
      onLine(text.replace(/\r$/, "").replace(secret, "TUCKTUCK_TOKEN=***"), s);

    // Вывод приходит кусками, и граница куска регулярно приходится на середину
    // строки. Без склейки одна строка лога приезжала бы двумя, а каждый
    // законченный кусок добавлял бы пустую строку в конце.
    const bufs: Record<string, string> = { out: "", err: "" };
    const emit = (text: string, s: "out" | "err") => {
      const parts = (bufs[s] + text).split("\n");
      bufs[s] = parts.pop() ?? "";
      for (const p of parts) line(p, s);
    };
    /** Хвост без перевода строки в конце — тоже строка, и обычно это ошибка. */
    const flush = () => {
      for (const s of ["out", "err"] as const) {
        if (bufs[s]) {
          line(bufs[s], s);
          bufs[s] = "";
        }
      }
    };
    /**
     * Сообщение от самой панели, а не от сервера.
     *
     * Сначала выталкиваем недособранные строки: иначе «Подключено…» вклинилось
     * бы в середину чужой недописанной строки и оба сообщения стали бы
     * нечитаемыми.
     */
    const note = (text: string, s: "err" | "sys" = "sys") => {
      flush();
      for (const p of text.split("\n")) line(p, s);
    };

    const finish = (r: InstallResult) => {
      if (settled) return;
      settled = true;
      flush();
      clearTimeout(timer);
      try {
        conn.end();
      } catch {
        // Соединение уже могло развалиться — на результат это не влияет.
      }
      resolve(r);
    };

    const timer = setTimeout(() => {
      note(t("ssh.timedOut", { sec: Math.round(timeoutMs / 1000) }));
      finish({ ok: false, fingerprint, code: null });
    }, timeoutMs);

    conn.on("error", (e: any) => {
      note(friendly(e, t), "err");
      finish({ ok: false, fingerprint, code: null });
    });

    conn.on("ready", () => {
      note(t("ssh.connected", { user: target.user, host: target.host, port: target.port }));

      // Скрипт сначала целиком укладывается во временный файл и только потом
      // исполняется с закрытым stdin. Иначе любая команда внутри, читающая
      // stdin, съела бы остаток самого скрипта — а `sudo`, спросив пароль,
      // повис бы навсегда.
      const runner =
        'umask 077; f=$(mktemp) || exit 1; cat > "$f"; sh "$f" </dev/null; rc=$?; rm -f "$f"; exit $rc';
      const cmd = target.useSudo ? `sudo -n -- /bin/sh -c '${runner}'` : `/bin/sh -c '${runner}'`;

      conn.exec(cmd, (err, stream) => {
        if (err) {
          note(friendly(err, t), "err");
          return finish({ ok: false, fingerprint, code: null });
        }
        let code: number | null = null;
        stream.on("close", (c: number) => {
          code = typeof c === "number" ? c : null;
          finish({ ok: code === 0, fingerprint, code });
        });
        stream.on("data", (d: Buffer) => emit(d.toString("utf8"), "out"));
        stream.stderr.on("data", (d: Buffer) => emit(d.toString("utf8"), "err"));
        stream.end(script);
      });
    });

    const cfg: ConnectConfig = {
      host: target.host,
      port: target.port,
      username: target.user,
      privateKey: target.privateKey,
      passphrase: target.passphrase || undefined,
      readyTimeout: 20_000,
      // Клавиатурный и парольный вход выключены намеренно: единственный
      // поддерживаемый способ — ключ, и молчаливый откат на пароль сделал бы
      // из панели переборщик.
      tryKeyboard: false,
      hostVerifier: (key: Buffer) => {
        fingerprint = hostFingerprint(key);
        if (!target.expectedFingerprint) {
          note(t("ssh.fpRemembered", { fp: fingerprint }));
          return true;
        }
        if (target.expectedFingerprint === fingerprint) {
          note(t("ssh.fpMatch", { fp: fingerprint }));
          return true;
        }
        note(
          t("ssh.fpMismatch", { expected: target.expectedFingerprint, got: fingerprint }),
          "err"
        );
        return false;
      },
    };

    try {
      conn.connect(cfg);
    } catch (e: any) {
      note(friendly(e, t), "err");
      finish({ ok: false, fingerprint, code: null });
    }
  });
}
