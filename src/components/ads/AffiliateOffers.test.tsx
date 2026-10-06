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
import { AffiliateOfferGrid } from "./AffiliateOffers";
import fs from "node:fs";
import path from "node:path";

afterEach(() => {
  cleanup();
  act(() => setAdsSuppressed(false));
  vi.restoreAllMocks();
});

describe("Affiliate-Konfiguration", () => {
  it("enthält genau die 17 verifizierten, eindeutigen Awin-Partner", () => {
    expect(AFFILIATE_CONFIG.enabled).toBe(true);
    expect(AFFILIATE_CONFIG.offers).toHaveLength(17);
    expect(new Set(AFFILIATE_CONFIG.offers.map((o) => o.brand)).size).toBe(17);
    expect(new Set(AFFILIATE_CONFIG.offers.map((o) => o.advertiserId)).size).toBe(17);
    expect(AFFILIATE_CONFIG.offers.map((o) => o.advertiserId).sort()).toEqual(
      [
        "10719", "111366", "11609", "116725", "11823", "121692", "124474", "127589",
        "129151", "129787", "130403", "50865", "53027", "69786", "7605", "78152",
        "117567",
      ].sort(),
    );
    expect(AFFILIATE_CONFIG.offers.map((o) => o.advertiserId)).not.toContain("24935");
    expect(AFFILIATE_CONFIG.offers.map((o) => o.advertiserId)).not.toContain("11863");
    expect(AWIN_PUBLISHER_ID).toBe("3102390");
  });

  it("erhält jeden Link-Builder-Link und ued exakt und ergänzt nur den sicheren clickref", () => {
    for (const o of AFFILIATE_CONFIG.offers.filter((x) => !x.originalText)) {
      const u = new URL(o.trackingUrl);
      expect(u.protocol).toBe("https:");
      expect(AFFILIATE_TRACKING_HOSTS).toContain(u.hostname);
      expect(u.pathname).toBe("/cread.php");
      expect(u.searchParams.get("awinmid")).toBe(o.advertiserId);
      expect(u.searchParams.get("awinaffid")).toBe("3102390");
      expect(u.searchParams.get("ued")).toBe(o.destination);
      expect(u.searchParams.get("clickref")).toBeNull();
      expect(new URL(o.destination ?? "").protocol).toBe("https:");

      const clicked = new URL(affiliateTrackingUrl(o, o.rail));
      expect(clicked.searchParams.get("ued")).toBe(o.destination);
      expect(clicked.searchParams.get("clickref")).toBe(`mytransporter_${o.rail}`);
      clicked.searchParams.delete("clickref");
      expect(clicked.toString()).toBe(u.toString());
    }
  });

  it("erhält den tesa-Original-Textlink exakt und füllt genau einen clickref", () => {
    const tesa = AFFILIATE_CONFIG.offers.find((o) => o.id === "tesa");
    expect(tesa).toBeDefined();
    if (!tesa) return;
    expect(tesa.trackingUrl).toBe(
      "https://www.awin1.com/awclick.php?gid=583198&mid=117567&awinaffid=3102390&linkid=4535956&clickref=",
    );
    expect(tesa.originalText).toBe("tesa");
    expect(tesa.destination).toBeUndefined();
    expect(tesa.category).toBeUndefined();
    const live = affiliateTrackingUrl(tesa, tesa.rail);
    expect(live).toBe(
      "https://www.awin1.com/awclick.php?gid=583198&mid=117567&awinaffid=3102390&linkid=4535956&clickref=mytransporter_left",
    );
    const u = new URL(live);
    expect(u.hostname).toBe("www.awin1.com");
    expect(u.pathname).toBe("/awclick.php");
    expect(u.searchParams.get("mid")).toBe("117567");
    expect(u.searchParams.get("awinaffid")).toBe("3102390");
    expect(u.searchParams.get("gid")).toBe("583198");
    expect(u.searchParams.get("linkid")).toBe("4535956");
    expect(u.searchParams.getAll("clickref")).toEqual(["mytransporter_left"]);
  });

  it("verteilt Mobilität links und Wohnen/weitere Angebote rechts exakt 9 zu 8", () => {
    const left = affiliateOffersForRail("left");
    const right = affiliateOffersForRail("right");
    expect(left).toHaveLength(9);
    expect(left[7].brand).toBe("MindeBox");
    expect(left[8].brand).toBe("tesa");
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

describe("Partnerangebote nur auf /werbeflaeche", () => {
  function renderGrids() {
    return render(
      <div>
        <AffiliateOfferGrid group="left" title="L" />
        <AffiliateOfferGrid group="right" title="R" />
      </div>,
    );
  }

  it("zeigt 17 gekennzeichnete Karten mit unveränderten Links und Attributen", () => {
    const { container } = renderGrids();
    expect(screen.getAllByText("Anzeige · Partnerlink")).toHaveLength(17);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(17);
    links.forEach((a) => {
      const offer = AFFILIATE_CONFIG.offers.find((c) => c.id === a.dataset.affiliate)!;
      expect(a.getAttribute("href")).toBe(affiliateTrackingUrl(offer, offer.rail));
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe(AFFILIATE_REL);
    });
    expect(container.querySelectorAll('[data-rail="left"] [data-affiliate]')).toHaveLength(9);
    expect(container.querySelectorAll('[data-rail="right"] [data-affiliate]')).toHaveLength(8);
  });

  it("lädt keine Scripts, Bilder oder Netzwerkanfragen vor einem Klick", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = renderGrids();
    expect(container.querySelectorAll("script, img, iframe, link").length).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("nur die Route /werbeflaeche bindet Partnerangebote ein", () => {
    const dir = path.resolve(__dirname, "../../routes");
    const users = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => /AffiliateOffers|AffiliateOfferGrid|@\/lib\/affiliate/.test(fs.readFileSync(path.join(dir, f), "utf8")));
    expect(users).toEqual(["werbeflaeche.tsx"]);
    const rails = fs.readFileSync(path.resolve(__dirname, "AdRails.tsx"), "utf8");
    expect(rails).not.toMatch(/Affiliate/);
  });
});

describe("AdRails ohne Partnerkarten", () => {
  function Counter() {
    const [n, setN] = useState(0);
    return (
      <button type="button" onClick={() => setN((v) => v + 1)}>
        Zähler {n}
      </button>
    );
  }

  it("zeigt keine Affiliate-Links (Startseite) und erhält den Inhalt beim Unterdrücken", () => {
    const { container } = render(
      <AdRails>
        <Counter />
      </AdRails>,
    );
    expect(container.querySelectorAll("[data-affiliate], aside").length).toBe(0);
    const btn = screen.getByRole("button");
    act(() => btn.click());
    act(() => setAdsSuppressed(true));
    act(() => setAdsSuppressed(false));
    expect(screen.getByRole("button")).toBe(btn);
    expect(btn.textContent).toBe("Zähler 1");
  });
});
