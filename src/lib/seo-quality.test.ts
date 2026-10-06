import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { PUBLIC_PAGES, pageHead } from "./seo";
import { CMP_ALLOWED_PATHS } from "./adsense-cmp";

describe("Qualitätssanierung Suchmaschinen/Werbung", () => {
  it("Mietratgeber ist öffentlich in der Sitemap, Partnerseite nicht", () => {
    expect(PUBLIC_PAGES).toContain("/mietratgeber");
    expect(PUBLIC_PAGES as readonly string[]).not.toContain("/werbeflaeche");
  });
  it("Partnerseite noindex,follow, kein AdSense-Inventar, nicht in robots.txt gesperrt", () => {
    expect(fs.readFileSync("src/routes/werbeflaeche.tsx", "utf8")).toContain('robots: "noindex,follow"');
    expect(CMP_ALLOWED_PATHS as readonly string[]).not.toContain("/werbeflaeche");
    expect(fs.readFileSync("public/robots.txt", "utf8")).not.toMatch(/werbeflaeche/);
    const h = pageHead({ path: "/x", title: "t", description: "d", robots: "noindex,follow" });
    expect(h.meta).toContainEqual({ name: "robots", content: "noindex,follow" });
  });
  it("Startseite verlinkt Hilfeseiten crawlbar", () => {
    const s = fs.readFileSync("src/components/HomeOfferSummary.tsx", "utf8");
    for (const to of ["/preise", "/mietratgeber", "/faq", "/kontakt"]) expect(s).toContain(`to="${to}"`);
  });
});
