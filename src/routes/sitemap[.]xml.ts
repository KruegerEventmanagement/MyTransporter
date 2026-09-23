import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { PUBLIC_PAGES, absoluteUrl } from "@/lib/seo";

/** Nur öffentliche, kanonische Seiten. Kein lastmod (unbekannt), kein changefreq/priority. */
export function buildSitemapXml(): string {
  const urls = PUBLIC_PAGES.map((p) => `  <url>\n    <loc>${absoluteUrl(p)}</loc>\n  </url>`);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () =>
        new Response(buildSitemapXml(), {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});
