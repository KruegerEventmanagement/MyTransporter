import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  PUBLIC_PAGES,
  SITE_URL,
  absoluteUrl,
  pageHead,
  privateHead,
  safeJsonLd,
  siteJsonLd,
} from "@/lib/seo";
import { buildSitemapXml } from "@/routes/sitemap[.]xml";

const routeFile = (path: string) =>
  `src/routes/${path === "/" ? "index" : path.slice(1)}.tsx`;
const read = (f: string) => readFileSync(f, "utf8");

describe("SEO helper", () => {
  it("builds non-www canonical and og:url", () => {
    const h = pageHead({ path: "/preise", title: "T", description: "D" });
    expect(h.links).toEqual([{ rel: "canonical", href: "https://mytransporter.org/preise" }]);
    expect(h.meta).toContainEqual({ property: "og:url", content: "https://mytransporter.org/preise" });
    expect(SITE_URL).not.toContain("www.");
    expect(absoluteUrl("/")).toBe("https://mytransporter.org/");
  });

  it("emits valid, escaped JSON-LD with breadcrumbs", () => {
    const h = pageHead({
      path: "/x",
      title: "</script><b>",
      description: "D",
      breadcrumbs: [{ name: "Start", path: "/" }, { name: "X", path: "/x" }],
    });
    const json = h.scripts[0].children;
    expect(json).not.toContain("</script>");
    const parsed = JSON.parse(json);
    const types = parsed["@graph"].map((n: { "@type": string }) => n["@type"]);
    expect(types).toContain("BreadcrumbList");
    expect(JSON.parse(safeJsonLd(siteJsonLd()))["@graph"]).toHaveLength(2);
  });

  it("private head is noindex", () => {
    expect(privateHead("A").meta).toContainEqual({ name: "robots", content: "noindex,nofollow" });
  });
});

describe("routes", () => {
  it("every public page exists and uses pageHead", () => {
    for (const p of PUBLIC_PAGES) {
      const f = routeFile(p);
      expect(existsSync(f), f).toBe(true);
      expect(read(f), f).toContain("pageHead(");
    }
  });

  it("titles are unique across public pages", () => {
    const titles = PUBLIC_PAGES.map((p) => {
      const m = /title:\s*[`"]([^`"]+)[`"]/.exec(read(routeFile(p)));
      return m?.[1];
    });
    expect(titles.every(Boolean)).toBe(true);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("private routes use noindex", () => {
    for (const f of [
      "admin", "profil", "buchung.$bookingId", "trip.$bookingId", "auth.confirm", "checkout.return",
    ]) {
      expect(read(`src/routes/${f}.tsx`), f).toContain("privateHead(");
    }
  });

  it("root keeps verification tags and German language, no stale boilerplate", () => {
    const root = read("src/routes/__root.tsx");
    expect(root).toContain('{ name: "google-site-verification", content: "RtHXueJEpVbh7zZoqhrwrpD2ZqqYZIRRNVdVimE-48I" }');
    expect(root).toContain('{ name: "google-adsense-account", content: "ca-pub-6974851907377988" }');
    expect(root).toContain('{ name: "verification", content: "b7cde8d0588c5c053a4219e04e38801f" }');
    expect(root).toContain('<html lang="de">');
    expect(root).not.toMatch(/Transporter Hub|twitter:site|og:image|lovable\.app/);
  });

  it("no hidden keyword blocks or www canonicals in public routes", () => {
    expect(read("src/components/HeroSection.tsx")).not.toContain('className="hidden"');
    expect(read("src/routes/index.tsx")).not.toContain("sr-only");
    for (const p of PUBLIC_PAGES) expect(read(routeFile(p))).not.toContain("www.mytransporter.org");
  });

  it("/partner permanently redirects to /werbung", () => {
    expect(read("src/routes/partner.tsx")).toContain('redirect({ to: "/werbung", statusCode: 301 })');
  });
});

describe("sitemap", () => {
  const xml = buildSitemapXml();
  it("lists exactly the public canonical pages", () => {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(PUBLIC_PAGES.map(absoluteUrl));
    expect(locs).toContain("https://mytransporter.org/langzeitmiete");
    expect(locs).toContain("https://mytransporter.org/transporter-mieten-pforzheim-calw");
    expect(locs).toContain("https://mytransporter.org/umzugstransporter-mieten");
  });
  it("has no private URLs or lastmod", () => {
    expect(xml).not.toMatch(/\/admin|\/profil|\/buchung\/|\/trip\/|checkout|\/auth|www\.mytransporter|lastmod|changefreq/);
  });
  it("robots.txt references the sitemap and allows crawling", () => {
    const r = read("public/robots.txt");
    expect(r).toContain("Sitemap: https://mytransporter.org/sitemap.xml");
    expect(r).toContain("Allow: /");
  });
});
