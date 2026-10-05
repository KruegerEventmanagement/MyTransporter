# Awin-Partnerseitenleisten auf 16 Angebote erweitern

## Ziel
Die vorhandene öffentliche Affiliate-Werbung wird ausschließlich in den bestehenden Desktop-Seitenleisten ausgebaut: 8 Karten links, 8 rechts, jedes der 16 verifizierten Angebote genau einmal. Unter 1280 px bleiben Werbung und reservierter Platz vollständig ausgeblendet.

## Umsetzung
- Die zentrale Angebotsliste auf exakt die 16 gelieferten Marken erweitern; Reihenfolge nach Mobilität links sowie Wohnen/Umzug und weitere Angebote rechts festlegen.
- Die gelieferten Ziel- und Trackingwerte unverändert übernehmen und je Platzierung nur einen festen, nicht personenbezogenen `clickref` ergänzen.
- Die bisherige Einzelkarte durch eine schmale Liste aus acht Karten pro Rail ersetzen. Jede Karte zeigt Kennzeichnung, lokalen Lucide-Icon, Markenname, neutrale Kategorie, „Zum Anbieter“ und die Provisionsinformation.
- Die Rails innerhalb der bestehenden 160-px-Spalten natürlich mit der Seite laufen lassen. Sticky-Verhalten entfällt, damit alle acht Karten ohne abgeschnittenen Inhalt erreichbar sind.
- Die Inline-Partnersektion auf der Startseite samt Import entfernen; keine Ersatzfläche in Inhalt, Kopf oder Fuß ergänzen.
- Bestehende Route-Platzierungen und die Unterdrückung bei Login/Registrierung, Buchung ab Schritt 3, Checkout, Zahlung/Bestätigung und aktiver Fahrt unverändert lassen.
- `ad-rails-root`, `AD_RAILS_CONTENT_KEY` und die Vorfahrenstruktur der Buchungsinhalte unverändert erhalten. Die ausgeschalteten Google-Anzeigen und deren Einwilligungslogik bleiben unangetastet.
- Die Datenschutzerklärung bleibt inhaltlich unverändert, da sie Linkweiterleitung, Klickzeitpunkt, mögliche Cookies und Provision bereits passend beschreibt.

## Technische Details
- `affiliate.ts`: vollständige typisierte Liste, Icon-Typen, feste linke/rechte Verteilung und sichere Link-Erzeugung mit kontrolliertem `clickref`.
- `AffiliateOffers.tsx`: Rail-Liste statt Inline-Sektion; ausschließlich lokale Icons und normal umbrechender Text, keine externen Medien oder Vorab-Anfragen.
- `AdRails.tsx`: je aktive Seite zwei Rails mit je acht Angeboten; unveränderte Content-Keys und DOM-Ancestry; `hidden xl:block`, feste 160 px und kein überlagerndes Layout.
- `index.tsx`: alte Inline-Sektion entfernen.

## Prüfung
- Affiliate-Tests auf exakt 16 eindeutige zugelassene Programme, ausgeschlossene IDs, korrekte Publisher-/Advertiser-/Zielwerte, unverändertes `ued`, platzierungsbezogene sichere `clickref`, Linkattribute, 8/8-Verteilung und null Vorab-Netzwerk anpassen.
- Bestehende Identitäts-/State-Preservation-Tests in `AdRails` und die quellenbasierte Unterdrückung vollständig beibehalten und ausführen.
- Browserprüfung ohne Affiliate-Klicks bei 390 px, 1279 px, 1280 px und 1440 px: unsichtbar unter xl, sichtbar ab xl, 16 eindeutige Links, 8/8, kein horizontaler Dokument-Overflow und lange Markennamen passen.
- Betroffene Tests, vollständige Testsuite, Typecheck und Produktionsbuild jeweils mit Exitcode prüfen.
- Keine Käufe, Buchungen, Zahlungen, E-Mails, Affiliate-Klicks, Veröffentlichung oder Hostingänderung ausführen.
