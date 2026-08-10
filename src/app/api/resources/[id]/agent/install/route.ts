// Установка агента мониторинга на сервер по SSH — с живым логом.
//
// Ответ — поток NDJSON, по объекту на строку. Не SSE: EventSource умеет только
// GET, а приватный ключ в query-строке — это ключ в логах прокси и в истории
// браузера. Поток читается обычным fetch + reader.
//
// Токен агента выпускается здесь же и сразу уходит на сервер: показывать его
// человеку, чтобы он вставил его в команду, при установке из панели незачем.

import path from "path";
import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { visibilityWhere } from "@/lib/resources";
import { buildScript, normalizeKey, runInstall } from "@/lib/ssh-install";
import crypto from "crypto";
import { tForRequest } from "@/lib/i18n/server";
import { panelBaseUrl } from "@/lib/panel-url";

// ssh2 — обычный node-модуль с сокетами, в edge-рантайме не живёт.
export const runtime = "nodejs";
// Ответ стримится по мере выполнения; кешировать его нечему и незачем.
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

type Body = {
  host?: string;
  port?: number | string;
  user?: string;
  privateKey?: string;
  passphrase?: string;
  useSudo?: boolean;
  /** Забыть прежний отпечаток: сервер переставили, ключ хоста сменился законно. */
  resetFingerprint?: boolean;
};

const USER_RE = /^[a-z_][a-z0-9._-]*$/i;

export async function POST(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  // Всё, что может отказать до начала потока, проверяем ДО него: отдать 200 и
  // положить ошибку внутрь тела — значит заставить клиента разбирать успех.
  let me;
  try {
    me = await requirePermission("resources.manage");
  } catch {
    return Response.json({ error: t("err.forbidden") }, { status: 403 });
  }

  const { id } = await ctx.params;
  const res = await prisma.resource.findFirst({
    where: { id, ...visibilityWhere(me) },
    select: { id: true, ip: true, isSelf: true, sshFingerprint: true, agentToken: true },
  });
  if (!res) return Response.json({ error: t("err.notFound") }, { status: 404 });
  if (res.isSelf) {
    return Response.json(
      { error: t("install.err.selfServer") },
      { status: 400 }
    );
  }

  const b = (await req.json().catch(() => ({}))) as Body;

  const host = String(b.host || res.ip || "").trim();
  if (!host) return Response.json({ error: t("install.err.noHost") }, { status: 400 });

  const port = parseInt(String(b.port ?? 22), 10);
  if (!isFinite(port) || port < 1 || port > 65535) {
    return Response.json({ error: t("install.err.portRange") }, { status: 400 });
  }

  const user = String(b.user || "root").trim();
  if (!USER_RE.test(user)) return Response.json({ error: t("install.err.badUser") }, { status: 400 });

  const privateKey = normalizeKey(String(b.privateKey || ""));
  if (!privateKey) return Response.json({ error: t("install.err.noKey") }, { status: 400 });

  // Адрес, по которому агент будет слать метрики. Это чужая машина, поэтому
  // origin запроса не годится: внутри контейнера он равен https://0.0.0.0:3000.
  const baseUrl = panelBaseUrl(req);
  if (!baseUrl) {
    return Response.json({ error: t("install.err.noPublicUrl") }, { status: 400 });
  }
  const expectedFingerprint = b.resetFingerprint ? "" : res.sshFingerprint;

  // Скрипты берём с диска, а не по HTTP у самих себя: сервер панели может не
  // ходить наружу через собственный домен, да и лишний сетевой вызов здесь ни
  // к чему.
  const dir = path.join(process.cwd(), "public");
  const [agentSh, installSh] = await Promise.all([
    readFile(path.join(dir, "agent.sh"), "utf8"),
    readFile(path.join(dir, "install.sh"), "utf8"),
  ]);

  // Существующий токен ПЕРЕИСПОЛЬЗУЕТСЯ, новый выпускается только для ресурса
  // без агента.
  //
  // Ротация на каждую переустановку выглядела аккуратнее, но ломала машину при
  // любой неудаче: install.sh записывает env и только потом делает пробную
  // отправку, так что после сбоя на сервере остаётся один токен, а в панели
  // другой. Перевыпуск остался отдельным действием в карточке — там он
  // осознанный.
  const isNewToken = !res.agentToken;
  const token = res.agentToken || crypto.randomBytes(24).toString("hex");

  // Записываем ДО установки: пробная отправка внутри install.sh идёт с этим
  // токеном, и незнакомый панели токен она встретит как 401. Именно на этом
  // первая рабочая установка и остановилась.
  if (isNewToken) {
    await prisma.resource.update({ where: { id }, data: { agentToken: token } });
  }

  const script = buildScript({ url: baseUrl, token, agentSh, installSh });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          // Клиент ушёл со страницы. Установка на сервере при этом идёт до
          // конца — обрывать её на полпути было бы хуже, чем доделать молча.
          closed = true;
        }
      };

      send({
        type: "status",
        state: "running",
        text: t("install.connecting", { user, host, port }),
      });

      const result = await runInstall(
        { host, port, user, privateKey, passphrase: b.passphrase, expectedFingerprint, useSudo: !!b.useSudo },
        script,
        // Строки уже собраны по границам переводов — отдаём как есть.
        (line, s) => send({ type: "log", stream: s, text: line }),
        t
      );

      // Адрес и отпечаток запоминаем, если команда на той стороне реально
      // выполнилась (code !== null): значит, хостовый ключ прошёл проверку и
      // сервер принял наш ключ — хост подлинный, даже если установка потом
      // упала. При несовпадении отпечатка сюда не доходит вовсе.
      if (result.code !== null) {
        await prisma.resource
          .update({
            where: { id },
            data: {
              sshHost: host === res.ip ? "" : host,
              sshPort: port,
              sshUser: user,
              sshFingerprint: result.fingerprint || res.sshFingerprint,
            },
          })
          .catch(() => null);
      }

      if (result.ok) {
        send({ type: "done", ok: true, text: t("install.done.ok") });
      } else {
        // Новый токен откатываем: агента на машине нет, а «подключён» в списке
        // означал бы, что метрики просто не идут.
        if (isNewToken) {
          await prisma.resource
            .update({ where: { id }, data: { agentToken: "" } })
            .catch(() => null);
        }
        send({
          type: "done",
          ok: false,
          text:
            result.code === null
              ? t("install.done.noConnection")
              : t("install.done.failed", { code: result.code }),
        });
      }

      closed = true;
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Caddy и nginx иначе копят ответ в буфере, и «живой лог» приезжает
      // одним куском в самом конце — ровно тогда, когда он уже не нужен.
      "X-Accel-Buffering": "no",
    },
  });
}
