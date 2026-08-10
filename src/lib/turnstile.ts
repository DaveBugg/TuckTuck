// Cloudflare Turnstile — серверная верификация токена. Fail-open: если секрет
// не задан (TURNSTILE_SECRET_KEY пуст), капча пропускается (как в казино) —
// удобно для локалки/стейджинга без ключей. Токен приходит в X-Turnstile-Token.
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

/** true = проверка пройдена (или капча выключена). false = токен невалиден. */
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // fail-open: капча не настроена
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json().catch(() => ({ success: false }));
    return !!data.success;
  } catch {
    // Cloudflare недоступен → fail-open (не блокируем вход из-за их даунтайма).
    return true;
  }
}
