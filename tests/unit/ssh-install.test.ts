import test from "node:test";
import assert from "node:assert/strict";
import { buildScript, hostFingerprint, normalizeKey } from "../../src/lib/ssh-install";

const AGENT = "#!/bin/sh\necho agent\n";
const INSTALL = "#!/bin/sh\necho install\n";

test("normalizeKey: CRLF и отсутствие перевода строки в конце", () => {
  const k = normalizeKey("-----BEGIN X-----\r\nabc\r\n-----END X-----");
  assert.equal(k, "-----BEGIN X-----\nabc\n-----END X-----\n");
  assert.ok(!k.includes("\r"));
});

test("normalizeKey: пустой ввод остаётся пустым, а не превращается в перевод строки", () => {
  assert.equal(normalizeKey("   \n  "), "");
});

test("hostFingerprint совпадает с форматом OpenSSH", () => {
  const fp = hostFingerprint(Buffer.from("host key bytes"));
  assert.match(fp, /^SHA256:[A-Za-z0-9+/]+$/);
  assert.ok(!fp.endsWith("="), "паддинг base64 в ssh не печатается");
});

test("buildScript кладёт агент в heredoc и подключает install.sh", () => {
  const s = buildScript({ url: "https://p.example", token: "tok", agentSh: AGENT, installSh: INSTALL });
  assert.ok(s.includes("TUCKTUCK_URL='https://p.example'"));
  assert.ok(s.includes("TUCKTUCK_TOKEN='tok'"));
  assert.ok(s.includes("<<'TUCKTUCK_AGENT_EOF'"));
  assert.ok(s.includes("echo agent"));
  assert.ok(s.includes("echo install"));
  // Порядок обязателен: install.sh читает файл, который heredoc создаёт выше.
  assert.ok(s.indexOf("TUCKTUCK_AGENT_EOF") < s.indexOf("echo install"));
});

test("buildScript экранирует одинарную кавычку в токене и адресе", () => {
  // Токен генерируем сами и кавычек в нём не бывает, но адрес приходит из
  // заголовка запроса. Незакрытая кавычка сломала бы весь скрипт целиком.
  const s = buildScript({
    url: "https://p'; rm -rf /; echo '",
    token: "a'b",
    agentSh: AGENT,
    installSh: INSTALL,
  });
  assert.ok(s.includes(`TUCKTUCK_TOKEN='a'\\''b'`));
  assert.ok(!s.includes("rm -rf /;\n"), "инъекция не должна выйти за пределы строки");
  // Каждая строка присваивания остаётся одной строкой с чётным числом кавычек.
  const line = s.split("\n").find(l => l.startsWith("TUCKTUCK_URL="))!;
  assert.equal((line.match(/'/g) || []).length % 2, 0);
});

test("buildScript не тащит CRLF на сервер", () => {
  const s = buildScript({
    url: "https://p",
    token: "t",
    agentSh: "#!/bin/sh\r\necho hi\r\n",
    installSh: "#!/bin/sh\r\necho bye\r\n",
  });
  assert.ok(!s.includes("\r"), "sh на Linux спотыкается о \\r в конце строки");
});
