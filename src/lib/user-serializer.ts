type UserWithTelegram = { telegramUserId: bigint | null };

/**
 * Привести telegramUserId к JSON-safe виду.
 *
 * В схеме это BigInt, а JSON.stringify не умеет сериализовать BigInt.
 * Все API, которые отдают пользователя наружу, должны проходить через эту
 * функцию (или маппер, её использующий).
 */
export function serializeTelegramUserId(
  v: bigint | null | undefined
): string | null {
  return v != null ? String(v) : null;
}

export function userWithTelegram<T extends UserWithTelegram>(u: T) {
  return { ...u, telegramUserId: serializeTelegramUserId(u.telegramUserId) };
}
