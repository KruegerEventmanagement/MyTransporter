// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import {
  AFFILIATE_CONFIG,
  AFFILIATE_TRACKING_HOSTS,
  AWIN_PUBLISHER_ID,
} from "@/lib/affiliate";
import { setAdsSuppressed } from "@/lib/ad-visibility";
import { ADSENSE_CONFIG } from "@/lib/adsense";
import { AffiliateOffersSection } from "./AffiliateOffers";
import { AdRails } from "./AdRails";

afterEach(() => {
  cleanup();
  act(() => setAdsSuppressed(false));
  vi.restoreAllMocks();
});

describe("Affiliate-Konfiguration", () => {
  it("enthält genau die zwei verifizierten Awin-Partner", () => {
    expect(AFFILIATE_CONFIG.enabled).toBe(true);
    expect(AFFILIATE_CONFIG.offers.map((o) => [o.brand, o.advertiserId])).toEqual([
      ["reifen.com", "7605"],
      ["FineBuy", "53027"],
    ]);
    expect(AWIN_PUBLISHER_ID).toBe("3102390");
  });

  it("nutzt https-Trackinglinks mit korrektem Publisher, Advertiser und Ziel", () => {
    for (const o of AFFILIATE_CONFIG.offers) {
      const u = new URL(o.trackingUrl);
      expect(u.protocol).toBe("https:");
      expect(AFFILIATE_TRACKING_HOSTS).toContain(u.hostname);
      expect(u.pathname).toBe("/cread.php");
      expect(u.searchParams.get("awinmid")).toBe(o.advertiserId);
      expect(u.searchParams.get("awinaffid")).toBe("3102390");
      expect(u.searchParams.get("ued")).toBe(o.destination);
      expect(new URL(o.destination).protocol).toBe("https:");
    }
  });

  it("lässt AdSense deaktiviert", () => {
    expect(ADSENSE_CONFIG.enabled).toBe(false);
    expect(ADSENSE_CONFIG.siteApproved).toBe(false);
    expect(ADSENSE_CONFIG.liveCmpVerified).toBe(false);
  });
});

describe("AffiliateOffersSection", () => {
  it("zeigt gekennzeichnete Karten mit sponsored/noopener und neuem Tab", () => {
    render(<AffiliateOffersSection />);
    expect(screen.getByText("Partnerangebote für unterwegs und zu Hause")).toBeTruthy();
    expect(screen.getAllByText("Anzeige · Partnerlink").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Bei einem Kauf über diese Links können wir eine Provision erhalten."),
    ).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    links.forEach((a, i) => {
      expect(a.getAttribute("href")).toBe(AFFILIATE_CONFIG.offers[i]!.trackingUrl);
      expect(a.getAttribute("target")).toBe("_blank");
      const rel = a.getAttribute("rel")!.split(" ");
      for (const r of ["sponsored", "nofollow", "noopener", "noreferrer"]) expect(rel).toContain(r);
      expect(a.textContent).toContain("Zum Shop");
    });
  });

  it("lädt keine Scripts, Bilder oder Netzwerkanfragen", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = render(<AffiliateOffersSection />);
    expect(container.querySelectorAll("script, img, iframe, link").length).toBe(0);
    expect(document.querySelectorAll('script[src*="awin"]').length).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blendet sich bei unterdrückter Werbung aus", () => {
    render(<AffiliateOffersSection />);
    act(() => setAdsSuppressed(true));
    expect(screen.queryByTestId("affiliate-section")).toBeNull();
    act(() => setAdsSuppressed(false));
    expect(screen.getByTestId("affiliate-section")).toBeTruthy();
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

  it("zeigt links/rechts je eine Partnerkarte und erhält Inhalt beim Unterdrücken", () => {
    const { container } = render(
      <AdRails>
        <Counter />
      </AdRails>,
    );
    expect(container.querySelectorAll('[data-testid="affiliate-rail"]').length).toBe(2);
    const btn = screen.getByRole("button");
    act(() => btn.click());
    act(() => btn.click());
    act(() => setAdsSuppressed(true));
    expect(container.querySelectorAll('[data-testid="affiliate-rail"]').length).toBe(0);
    expect(container.querySelectorAll("aside").length).toBe(0);
    expect(screen.getByRole("button")).toBe(btn);
    expect(btn.textContent).toBe("Zähler 2");
    act(() => setAdsSuppressed(false));
    expect(screen.getByRole("button")).toBe(btn);
    expect(btn.textContent).toBe("Zähler 2");
    expect(container.querySelectorAll('[data-testid="affiliate-rail"]').length).toBe(2);
  });
});
