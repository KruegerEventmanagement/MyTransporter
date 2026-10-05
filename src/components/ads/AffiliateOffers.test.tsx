// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import {
  AFFILIATE_CONFIG,
  AFFILIATE_DISCLOSURE,
  AFFILIATE_REL,
  AFFILIATE_TRACKING_HOSTS,
  AWIN_PUBLISHER_ID,
  affiliateOffersForRail,
  affiliateTrackingUrl,
} from "@/lib/affiliate";
import { setAdsSuppressed } from "@/lib/ad-visibility";
import { ADSENSE_CONFIG } from "@/lib/adsense";
import { AdRails } from "./AdRails";

afterEach(() => {
  cleanup();
  act(() => setAdsSuppressed(false));
  vi.restoreAllMocks();
});

describe("Affiliate-Konfiguration", () => {
  it("enthält genau die 16 verifizierten, eindeutigen Awin-Partner", () => {
    expect(AFFILIATE_CONFIG.enabled).toBe(true);
    expect(AFFILIATE_CONFIG.offers).toHaveLength(16);
    expect(new Set(AFFILIATE_CONFIG.offers.map((o) => o.brand)).size).toBe(16);
    expect(new Set(AFFILIATE_CONFIG.offers.map((o) => o.advertiserId)).size).toBe(16);
    expect(AFFILIATE_CONFIG.offers.map((o) => o.advertiserId).sort()).toEqual(
      [
        "10719", "111366", "11609", "116725", "11823", "121692", "124474", "127589",
        "129151", "129787", "130403", "50865", "53027", "69786", "7605", "78152",
      ].sort(),
    );
    expect(AFFILIATE_CONFIG.offers.map((o) => o.advertiserId)).not.toContain("24935");
    expect(AFFILIATE_CONFIG.offers.map((o) => o.advertiserId)).not.toContain("11863");
    expect(AWIN_PUBLISHER_ID).toBe("3102390");
  });

  it("erhält jeden Link-Builder-Link und ued exakt und ergänzt nur den sicheren clickref", () => {
    for (const o of AFFILIATE_CONFIG.offers) {
      const u = new URL(o.trackingUrl);
      expect(u.protocol).toBe("https:");
      expect(AFFILIATE_TRACKING_HOSTS).toContain(u.hostname);
      expect(u.pathname).toBe("/cread.php");
      expect(u.searchParams.get("awinmid")).toBe(o.advertiserId);
      expect(u.searchParams.get("awinaffid")).toBe("3102390");
      expect(u.searchParams.get("ued")).toBe(o.destination);
      expect(u.searchParams.get("clickref")).toBeNull();
      expect(new URL(o.destination).protocol).toBe("https:");

      const clicked = new URL(affiliateTrackingUrl(o, o.rail));
      expect(clicked.searchParams.get("ued")).toBe(o.destination);
      expect(clicked.searchParams.get("clickref")).toBe(`mytransporter_${o.rail}`);
      clicked.searchParams.delete("clickref");
      expect(clicked.toString()).toBe(u.toString());
    }
  });

  it("verteilt Mobilität links und Wohnen/weitere Angebote rechts exakt 8 zu 8", () => {
    const left = affiliateOffersForRail("left");
    const right = affiliateOffersForRail("right");
    expect(left).toHaveLength(8);
    expect(right).toHaveLength(8);
    expect(left.slice(0, 5).map((o) => o.brand)).toEqual([
      "reifen.com", "ReifenDirekt", "Carshine", "reifen.de", "Evercross",
    ]);
    expect(right.slice(0, 5).map((o) => o.brand)).toEqual([
      "FineBuy", "Dublino Möbel", "Lunzo", "ElectricSun", "brickzonehub",
    ]);
    expect([...left, ...right]).toEqual(AFFILIATE_CONFIG.offers);
  });

  it("kennzeichnet besondere Zielgruppen und verwendet die Kundenmarke", () => {
    const byBrand = new Map(AFFILIATE_CONFIG.offers.map((o) => [o.brand, o]));
    expect(byBrand.get("World Businesses for Sale")?.category).toContain("Englisch");
    expect(byBrand.get("brickzonehub")?.category).toContain("UK-Shop");
    expect(byBrand.get("Hey Happiness")?.advertiserId).toBe("111366");
    expect(byBrand.has("Sparkle GmbH")).toBe(false);
  });

  it("lässt AdSense deaktiviert", () => {
    expect(ADSENSE_CONFIG.enabled).toBe(false);
    expect(ADSENSE_CONFIG.siteApproved).toBe(false);
    expect(ADSENSE_CONFIG.liveCmpVerified).toBe(false);
  });
});

describe("Affiliate-Seitenleisten", () => {
  it("zeigt 16 gekennzeichnete Karten mit korrekten Linkattributen und Texten", () => {
    const { container } = render(
      <AdRails>
        <div>Inhalt</div>
      </AdRails>,
    );
    expect(screen.getAllByText("Anzeige · Partnerlink")).toHaveLength(16);
    expect(screen.getAllByText(AFFILIATE_DISCLOSURE)).toHaveLength(16);
    expect(screen.getAllByText("Zum Anbieter")).toHaveLength(16);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(16);
    links.forEach((a) => {
      const offer = AFFILIATE_CONFIG.offers.find((candidate) => candidate.id === a.dataset.affiliate);
      expect(offer).toBeDefined();
      if (!offer) return;
      expect(a.getAttribute("href")).toBe(affiliateTrackingUrl(offer, offer.rail));
      expect(a.getAttribute("target")).toBe("_blank");
      const rel = (a.getAttribute("rel") ?? "").split(" ");
      for (const r of ["sponsored", "nofollow", "noopener", "noreferrer"]) expect(rel).toContain(r);
      expect(a.getAttribute("rel")).toBe(AFFILIATE_REL);
      expect(a.textContent).toContain("Zum Anbieter");
    });
    expect(container.querySelectorAll('[data-rail="left"] [data-affiliate]')).toHaveLength(8);
    expect(container.querySelectorAll('[data-rail="right"] [data-affiliate]')).toHaveLength(8);
  });

  it("lädt keine Scripts, Bilder oder Netzwerkanfragen", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = render(
      <AdRails>
        <div>Inhalt</div>
      </AdRails>,
    );
    expect(container.querySelectorAll("script, img, iframe, link").length).toBe(0);
    expect(document.querySelectorAll('script[src*="awin"]').length).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("enthält nur lokal gerenderte Lucide-Symbole", () => {
    const { container } = render(
      <AdRails>
        <div>Inhalt</div>
      </AdRails>,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(32);
    expect(container.querySelectorAll("img, picture, source")).toHaveLength(0);
  });
});

describe("AdRails mit Partnerkarten", () => {
  function Counter() {
    const [n, setN] = useState(0);
    return (
      <button type="button" onClick={() => setN((v) => v + 1)}>
        Zähler {n}
      </button>
    );
  }

  it("zeigt links/rechts je acht Partnerkarten und erhält Inhalt beim Unterdrücken", () => {
    const { container } = render(
      <AdRails>
        <Counter />
      </AdRails>,
    );
    expect(container.querySelectorAll('[data-affiliate]')).toHaveLength(16);
    const btn = screen.getByRole("button");
    act(() => btn.click());
    act(() => btn.click());
    act(() => setAdsSuppressed(true));
    expect(container.querySelectorAll('[data-affiliate]')).toHaveLength(0);
    expect(container.querySelectorAll("aside").length).toBe(0);
    expect(screen.getByRole("button")).toBe(btn);
    expect(btn.textContent).toBe("Zähler 2");
    act(() => setAdsSuppressed(false));
    expect(screen.getByRole("button")).toBe(btn);
    expect(btn.textContent).toBe("Zähler 2");
    expect(container.querySelectorAll('[data-affiliate]')).toHaveLength(16);
  });
});
