// Окно, в которое можно писать в Телеграм.
//
// Почему окно живёт у установки и у бота, но НЕ у пользователя.
//
// Напоминание адресовано чату, а не человеку: бот знает список chat_id, и в
// групповом чате сидят разные люди. Личное «мне не писать после 23:00» там
// нечем применить — панель не может знать, кто из участников спит, а два
// участника с разными окнами дают противоречие без разрешения. Поле в профиле
// выглядело бы настройкой, но не делало бы ничего.
//
// Зато у бота аудитория известна: это отдельный поток со своим списком чатов.
// «Боевые серверы круглосуточно, домены с 10 до 20» — обычный расклад, и он
// выражается ровно окном на бота поверх общего.
//
// Персональное окно станет осмысленным, когда появится привязка личного чата к
// пользователю (есть в планах): тогда у чата будет ровно один читатель, и его
// настройка получит смысл.

/** Часы одинаковы = ограничения нет: круглосуточно. */
export function isQuietAlways(fromHour: number, toHour: number): boolean {
  return fromHour === toHour;
}

/**
 * Можно ли слать в этот час.
 *
 * Окно задаётся началом и концом в местных часах. Конец НЕ включается: 9–21
 * значит «с 09:00 до 20:59», потому что «до 21» люди читают именно так.
 * Окно через полночь (22–7) поддерживается — для тех, у кого дежурство ночью.
 */
export function isWithinWindow(hour: number, fromHour: number, toHour: number): boolean {
  if (isQuietAlways(fromHour, toHour)) return true;
  if (fromHour < toHour) return hour >= fromHour && hour < toHour;
  // Через полночь: [from..23] ∪ [0..to)
  return hour >= fromHour || hour < toHour;
}

/**
 * Час в заданном часовом поясе.
 *
 * Через Intl, а не сдвигом на смещение: смещение меняется при переходе на
 * летнее время, и вручную посчитанный час дважды в год уезжал бы на единицу.
 */
export function hourInTimezone(date: Date, timezone: string): number {
  try {
    const s = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    }).format(date);
    const h = parseInt(s, 10);
    return isFinite(h) ? h % 24 : date.getUTCHours();
  } catch {
    // Неизвестный пояс не должен глушить оповещения совсем.
    return date.getUTCHours();
  }
}

/** Приводит присланное значение к целому часу 0–23 или null, если это мусор. */
export function parseHour(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 23) return null;
  return n;
}

/** Окно бота, если задано целиком; иначе общее. */
export function windowFor(
  bot: { notifyFromHour: number | null; notifyToHour: number | null },
  global: { notifyFromHour: number; notifyToHour: number }
): { from: number; to: number } {
  // Оба поля или ни одного: половина окна — это не окно, и трактовать «задан
  // только конец» как что-то осмысленное значило бы гадать за пользователя.
  if (bot.notifyFromHour != null && bot.notifyToHour != null) {
    return { from: bot.notifyFromHour, to: bot.notifyToHour };
  }
  return { from: global.notifyFromHour, to: global.notifyToHour };
}
