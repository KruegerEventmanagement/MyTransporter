import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { AD_RAILS_CONTENT_KEY, buildAdRailsTree } from "./AdRails";

/**
 * Regression: Der Inhalt (z. B. der Buchungsablauf) muss unabhängig von
 * Unterdrückung, Konfiguration und Einwilligung an exakt derselben, stabil
 * gekeyten DOM-Position hängen. Ändert sich die Vorfahrenkette oder der Key,
 * mountet React den Inhalt neu und der Buchungszustand wäre verloren.
 */
const CHILD = <div data-testid="booking">Buchung</div>;

type Node = ReactElement<{ children?: ReactNode; key?: string }>;

function findContentPath(node: ReactNode, path: string[] = []): string[] | null {
  if (!isValidElement(node)) return null;
  const el = node as Node;
  const typeName = typeof el.type === "string" ? el.type : "component";
  const here = [...path, `${typeName}#${el.key ?? "-"}`];
  if (el.key === AD_RAILS_CONTENT_KEY) return here;
  const kids = (el.props as { children?: ReactNode }).children;
  const list = Array.isArray(kids) ? kids : [kids];
  for (const kid of list) {
    const found = findContentPath(kid, here);
    if (found) return found;
  }
  return null;
}

function contentChildren(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return null;
  const el = node as Node;
  if (el.key === AD_RAILS_CONTENT_KEY) return (el.props as { children?: ReactNode }).children;
  const kids = (el.props as { children?: ReactNode }).children;
  const list = Array.isArray(kids) ? kids : [kids];
  for (const kid of list) {
    const found = contentChildren(kid);
    if (found) return found;
  }
  return null;
}

describe("AdRails Struktur", () => {
  const variants = [
    { name: "inaktiv", suppressed: false, left: false, right: false },
    { name: "unterdrückt mit Slots", suppressed: true, left: true, right: true },
    { name: "aktiv beidseitig", suppressed: false, left: true, right: true },
    { name: "aktiv nur links", suppressed: false, left: true, right: false },
  ];

  it("hält den Inhalt in jeder Variante an derselben gekeyten Position", () => {
    const paths = variants.map((v) =>
      findContentPath(buildAdRailsTree({ ...v, children: CHILD })),
    );
    expect(paths[0]).toEqual(["div#ad-rails-root", `div#${AD_RAILS_CONTENT_KEY}`]);
    for (const p of paths) expect(p).toEqual(paths[0]);
  });

  it("gibt die Kinder unverändert weiter (kein Remount durch Umschalten)", () => {
    for (const v of variants) {
      expect(contentChildren(buildAdRailsTree({ ...v, children: CHILD }))).toBe(CHILD);
    }
  });

  it("zeigt Werbespalten nur bei aktiven, nicht unterdrückten Slots", () => {
    const render = (v: (typeof variants)[number]) =>
      JSON.stringify(buildAdRailsTree({ ...v, children: CHILD }), (k, val) =>
        k === "children" && val === CHILD ? "child" : val,
      );
    expect(render(variants[0]!)).not.toContain("aside");
    expect(render(variants[1]!)).not.toContain("aside");
    expect(render(variants[2]!)).toContain("ad-rails-left");
    expect(render(variants[2]!)).toContain("ad-rails-right");
    expect(render(variants[3]!)).not.toContain("ad-rails-right");
  });
});

import { railFlags } from "./AdRails";
import { getRouteAdPolicy } from "@/lib/ad-placements";

describe("AdRails Richtlinie", () => {
  it("ohne Route-Richtlinie, Consent oder Freigabe keine Rails", () => {
    const none = { left: false, right: false, leftLower: false, rightLower: false };
    expect(railFlags(null, true)).toEqual(none);
    expect(railFlags(getRouteAdPolicy("/umzug"), false)).toEqual(none);
    expect(railFlags(getRouteAdPolicy("/umzug"), true)).toEqual(none); // Konfiguration deaktiviert
  });

  it("zweite Rail-Einheit hängt in derselben Spalte, Inhalt bleibt gekeyt", () => {
    const tree = buildAdRailsTree({ suppressed: false, left: true, right: true, leftLower: true, rightLower: true, children: CHILD });
    const json = JSON.stringify(tree, (k, v) => (k === "children" && v === CHILD ? "child" : v));
    expect(json).toContain("ad-rails-left-lower");
    expect(json).toContain("ad-rails-right-lower");
    expect(json).not.toContain("sticky");
    expect(findContentPath(tree)).toEqual(["div#ad-rails-root", `div#${AD_RAILS_CONTENT_KEY}`]);
  });
});
