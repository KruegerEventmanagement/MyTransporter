# QA Awin-Partnerlinks – 29.09.2026

## Umfang
- Aktiv: genau 2 Awin-Partner (Publisher 3102390): reifen.com (awinmid 7605), FineBuy (awinmid 53027). Links unverändert aus dem Awin-LinkBuilder.
- Nicht online: die übrigen 10 zugelassenen Programme.
- AdSense: unverändert ausstehend (`enabled`, `siteApproved`, `certifiedCmpConfigured`, `liveCmpVerified` = false). Keine AdSense-Anfragen.
- Keine Erlösgarantie. Keine Awin-Scripts, Pixel, Bilder oder Prefetch; das Netzwerk wird erst bei bewusstem Klick kontaktiert.

## Änderungen
- `src/lib/affiliate.ts` – Konfiguration (enabled=true, 2 Angebote).
- `src/components/ads/AffiliateOffers.tsx` – Abschnitt „Partnerangebote für unterwegs und zu Hause“ + schmale Seitenleistenkarte; Kennzeichnung „Anzeige · Partnerlink“, Provisionshinweis, `target=_blank`, `rel="sponsored nofollow noopener noreferrer"`.
- `src/components/ads/AdRails.tsx` – Partnerkarten als Fallback in den bestehenden Seitenleisten (nur ab xl); Vorfahren/Keys des Inhalts unverändert; `useAdsSuppressed` blendet alles aus.
- `src/routes/index.tsx` – Abschnitt unter HomeIntro.
- `src/routes/datenschutz.tsx` – neuer Abschnitt 8 „Partnerlinks (Awin)“.
- `src/components/ads/AffiliateOffers.test.tsx` – 7 neue Tests.

## Befehle
| Befehl | Exit | Ergebnis |
|---|---|---|
| `bun run test` | 0 | 22 Dateien, 272 Tests bestanden (inkl. unveränderter AdRails-Regressionstests) |
| `bun run typecheck` | 0 | `tsc --noEmit -p .` sauber |
| `bun run build` | 0 | Build OK, nicht deployt |

## Browserprüfung (lokale Vorschau, Playwright, kein Klick auf Links)
- Desktop 1440 px: Partnerkarten links (reifen.com) und rechts (FineBuy) sowie Abschnitt unten sichtbar; keine horizontale Überbreite.
- Mobil 390 px: keine Seitenleisten, Abschnitt mit zwei gestapelten Karten lesbar; keine horizontale Überbreite.
- Linkziele per DOM geprüft (href, rel, target). 0 Anfragen an awin1.com, reifen.com, finebuy.de oder googlesyndication beim Seitenaufruf.
- Keine Registrierung, Buchung, Zahlung oder Produktionswrites.

## Grenzen
- Kein echter Klick und keine Prüfung der Provisionszuordnung bei Awin.
- Kein Test auf echtem iPhone.

## Ergänzung: Login/Registrieren in der Navigation
- `src/lib/ad-visibility.ts`: Werbeunterdrückung jetzt quellenbasiert (jede `useSuppressAds`-Instanz eigene Quelle); `setAdsSuppressed` bleibt als manueller Schalter erhalten. Eine inaktive Quelle gibt eine aktive (z. B. Buchung) nicht mehr frei.
- `src/components/Navbar.tsx`: nur `useSuppressAds(showModal !== null)`; Auth-Logik unverändert.
- Neuer Test `src/lib/ad-visibility.test.tsx` (2 Tests: Überlappung, Unmount/manueller Schalter).
- Erneut: `bun run test` Exit 0 – 23 Dateien, 274 Tests bestanden; `bun run typecheck` Exit 0; `bun run build` Exit 0.
- Browser (ohne Formular abzusenden): sichtbare Partnerlinks Desktop vorher 4, bei offenem Registrieren 0, bei offenem Login 0; Mobil 390 px vorher 2, danach jeweils 0.

## Finale Prüfung (Layout-Korrektur + Datenschutz-Stand)
- `src/components/ads/AffiliateOffers.tsx`: Partnerkarte in der Seitenleiste mit `xl:pt-16` (nur CSS, keine Vorfahren/Keys geändert, Buchungsinhalt unverändert). Karte beginnt bei 144 px, App-Hinweis endet bei 104 px – keine Überdeckung, auch nach Scrollen (sticky).
- `src/routes/datenschutz.tsx`: „Stand: 29. September 2026“.
- Weiterhin genau 2 Partnerlinks; AdSense-Flags unverändert false; nicht deployt.
- `bun run test` Exit 0 – 23 Dateien, 274 Tests bestanden; `bun run typecheck` Exit 0; `bun run build` Exit 0.
- Browser: Desktop 1440 px und Mobil 390 px ohne horizontale Überbreite, 0 Anfragen an Awin/Händler/Google-Anzeigen; Navbar Registrieren/Login offen → 0 sichtbare Partnerlinks (Desktop vorher 4, Mobil vorher 2). Kein Klick auf Partnerlinks, nichts abgesendet.
