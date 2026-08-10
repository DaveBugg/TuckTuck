import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Склейка классов с разрешением конфликтов Tailwind.
 *
 * Нужен именно twMerge, а не просто clsx: при `cn("p-2", props.className)`
 * переданный снаружи `p-4` должен ПЕРЕБИТЬ базовый, а не встать рядом —
 * иначе выигрывает тот, что позже в CSS, и результат зависит от порядка
 * генерации, а не от намерения.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
