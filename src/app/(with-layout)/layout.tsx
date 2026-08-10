import React from "react";
import AppShell from "@/components/layout/app-shell";

export default function WithLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
