"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

/**
 * Тосты вместо alert(). Тема берётся из next-themes, иначе всплывашки
 * оставались бы светлыми на тёмной странице.
 */
function Toaster(props: React.ComponentProps<typeof Sonner>) {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={(resolvedTheme as "light" | "dark") ?? "system"}
      position="top-right"
      richColors
      closeButton
      {...props}
    />
  );
}

export { Toaster };
