// Конвертация даты ↔ строковое значение полей панели.
//
// Контракт значения (тот же, что у нативных <input type="date|datetime-local">,
// чтобы вызывающий код не переписывать):
//   без времени — "ГГГГ-ММ-ДД"
//   со временем — "ГГГГ-ММ-ДДTЧЧ:ММ"
// Строка ЛОКАЛЬНАЯ, не UTC.

/** Date → значение. toISOString() не годится: он в UTC и сдвигает дату на
 *  часовой пояс (в минусовых поясах — на сутки назад). */
export function toDateValue(d: Date, withTime = false): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime ? `${day}T${p(d.getHours())}:${p(d.getMinutes())}` : day;
}

/** Значение → Date в ЛОКАЛЬНОМ времени.
 *  `new Date("2026-07-29")` в JS — UTC-полночь, а не локальная: разбираем
 *  строку руками, иначе день уезжает на часовой пояс. Полный ISO-инстант
 *  (с секундами или Z) отдаём штатному парсеру — он там корректен. */
export function fromDateValue(v: string): Date | undefined {
  if (!v) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(v);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
    return isNaN(d.getTime()) ? undefined : d;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}
