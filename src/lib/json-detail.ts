// Разбор «деталей» события для показа. Вынесен из JsonView, чтобы логика
// (а она нетривиальна: строка/объект/мусор) проверялась юнит-тестом без DOM.
export type Detail =
  | { kind: "json"; data: Record<string, unknown> | unknown[] }
  | { kind: "text"; text: string };

export function parseDetail(value: unknown): Detail {
  if (value !== null && typeof value === "object") {
    return { kind: "json", data: value as Record<string, unknown> };
  }
  if (typeof value === "string") {
    try {
      const d = JSON.parse(value);
      // Скаляр из JSON.parse («42», «null») — не структура: показываем текстом.
      if (d !== null && typeof d === "object") return { kind: "json", data: d };
    } catch {
      /* не JSON — ниже вернём текстом */
    }
    return { kind: "text", text: value };
  }
  return { kind: "text", text: String(value) };
}
