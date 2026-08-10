import React from "react";

// Публичные страницы (логин, логаут) — без сайдбара и шапки.
export default function NonLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
