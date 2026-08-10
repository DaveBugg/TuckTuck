"use client";
// Единый клиентский fetch к нашим /api/*: 401 (протухшая/ревокнутая сессия) →
// чистим display-cookie и уводим на логин, вместо «Unauthorized» в интерфейсе.
import Cookies from "js-cookie";
import { makeT } from "./i18n/translate";
import { LOCALE_COOKIE, resolveLocale } from "./i18n/config";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/**
 * Язык для сообщений самого клиента (сеть отвалилась, сессия истекла).
 *
 * Читаем куку напрямую, а не через React-контекст: apiFetch зовут из мест, где
 * хуки недоступны, — из обработчиков, из утилит, из таймеров.
 */
function clientT() {
  return makeT(resolveLocale(Cookies.get(LOCALE_COOKIE)));
}

export async function apiFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(path, init);
  if (res.status === 401) {
    Cookies.remove("tt_user");
    if (typeof window !== "undefined") {
      window.location.href = "/auth/login";
    }
    throw new ApiError(clientT()("err.sessionExpired"), 401);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error || clientT()("err.http", { status: res.status }), res.status);
  }
  return data;
}

export function apiJson(path: string, method: string, body?: unknown): Promise<any> {
  return apiFetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
