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
- Die Einblendung „App installieren“ überdeckt auf Desktop kurz den Kopf der linken Karte (bestehendes, schließbares Element).
- Kein Test auf echtem iPhone.
