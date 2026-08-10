import type { MetadataRoute } from "next";

// Панель TuckTuck (in.tucktuck.app) — полностью закрыта от индексации.
// Лендинг tucktuck.app обслуживается Caddy (статик) со своим robots — не этот.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
