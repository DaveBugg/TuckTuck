"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      // Без этого при переключении темы браузер анимирует все переходы разом,
      // и страница «моргает» цветом на пару кадров.
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
