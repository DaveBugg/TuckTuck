// Состояние диалога Telegram-бота Finance Board.
//
// Redis — основное хранилище, TTL 10 минут. Если Redis недоступен или не
// настроен, используем in-memory Map с тем же интерфейсом (fail-soft, как в
// rate-limit). Состояние не критично: пропавший диалог начинается заново.

import { getRedis, redisConfigured } from "./redis";
import type { FsmState } from "./tg-bot-fsm";

const TTL_SEC = 600;
const KEY_PREFIX = "tgfsm";

type MemoryEntry = { state: FsmState; expiresAt: number };

const memory = new Map<string, MemoryEntry>();

function key(chatId: string | number, userId: string | number): string {
  return `${KEY_PREFIX}:${chatId}:${userId}`;
}

function memoryKey(chatId: string | number, userId: string | number): string {
  return `${chatId}:${userId}`;
}

function cleanupMemory(): void {
  const now = Date.now();
  for (const [k, v] of memory.entries()) {
    if (v.expiresAt <= now) memory.delete(k);
  }
}

export async function getFsmState(
  chatId: string | number,
  userId: string | number
): Promise<FsmState> {
  const mk = memoryKey(chatId, userId);
  cleanupMemory();

  if (redisConfigured()) {
    try {
      const raw = await getRedis().get(key(chatId, userId));
      if (raw) {
        return JSON.parse(raw) as FsmState;
      }
    } catch {
      // Redis недоступен — падаем в память.
    }
  }

  const entry = memory.get(mk);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.state;
  }
  memory.delete(mk);
  return { step: "idle" };
}

export async function setFsmState(
  chatId: string | number,
  userId: string | number,
  state: FsmState
): Promise<void> {
  const mk = memoryKey(chatId, userId);
  cleanupMemory();

  if (redisConfigured()) {
    try {
      await getRedis().set(
        key(chatId, userId),
        JSON.stringify(state),
        "EX",
        TTL_SEC
      );
    } catch {
      // Провал Redis — пишем в память.
    }
  }

  memory.set(mk, { state, expiresAt: Date.now() + TTL_SEC * 1000 });
}

export async function clearFsmState(
  chatId: string | number,
  userId: string | number
): Promise<void> {
  const mk = memoryKey(chatId, userId);

  if (redisConfigured()) {
    try {
      await getRedis().del(key(chatId, userId));
    } catch {
      // Игнорируем: память всё равно очистим.
    }
  }

  memory.delete(mk);
}
