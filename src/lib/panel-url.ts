// Адрес панели, каким его видят СНАРУЖИ.
//
// Нужен там, где адрес уезжает на чужую машину: агенту мониторинга — чтобы
// было куда слать метрики. Внутри контейнера `new URL(req.url).origin` даёт
// `https://0.0.0.0:3000` — адрес, по которому не достучится никто, кроме
// самого контейнера. Это не теория: первая установка агента по SSH прошла все
// шаги и упала на пробной отправке ровно из-за этого.
//
// Порядок источников:
//   1. TUCKTUCK_PUBLIC_URL — явная настройка, самая надёжная;
//   2. заголовки обратного прокси — работают без настройки за Caddy/nginx;
//   3. origin запроса — последняя надежда, для запуска без прокси.

const BAD_HOST = /^(0\.0\.0\.0|\[::\]|::)/;

function clean(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Пригоден ли адрес для того, чтобы дать его чужой машине.
 *
 * 0.0.0.0 — это «слушаю на всех интерфейсах», а не адрес, по которому можно
 * прийти. localhost с другой машины указывает на неё саму.
 */
function usable(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (BAD_HOST.test(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function panelBaseUrl(req: Request): string | null {
  const configured = (process.env.TUCKTUCK_PUBLIC_URL || "").trim();
  if (configured && usable(configured)) return clean(configured);

  // Caddy и nginx проставляют их сами. Значение приходит из заголовка, то есть
  // от клиента, — но сюда попадают только админы, а худшее последствие ошибки
  // здесь в том, что агент получит неверный адрес и не пришлёт метрику.
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (host && !BAD_HOST.test(host)) {
    const candidate = `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
    if (usable(candidate)) return clean(candidate);
  }

  try {
    const origin = new URL(req.url).origin;
    return usable(origin) ? clean(origin) : null;
  } catch {
    return null;
  }
}
