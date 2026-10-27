# Passender Tarif für jede Mietdauer + einheitlicher Abholort

## 1. Problem
Bei 8 oder mehr Tagen wird immer auf volle Wochen aufgerundet (16 Tage → „3 × 7 Tage, 21 Tage, 1.497 €“). Der Kunde zahlt 5 Tage zu viel und bekommt den falschen Rückgabetermin.

## 2. Neue Preislogik (Vorschlag, bitte prüfen)
Richtwert Woche: **549 €** (kleiner Transporter), 619 € (langer), 650 € (Crafter). Heute: 499 / 569 / 590.

| Mietdauer | Preis (kleiner Transporter) |
|---|---|
| 1–6 Tage | unverändert (189 … 449 €) |
| 7 Tage | 549 € |
| 8–29 Tage | volle Wochen + passender Resttag-Tarif, aber nie teurer als die nächste volle Woche. Beispiel 16 Tage: 2 × 549 + 189 = **1.287 €**, Rückgabe nach genau 16 Tagen |
| ab 30 Tagen | Monatsstaffel, spürbar günstiger: 30 Tage 1.799 €, 45 Tage 2.499 €, 60 Tage 3.199 €, dazwischen anteilig |

- Lange/Crafter jeweils mit gleichem Abstand wie heute (+ Klassenaufschlag).
- Kilometer: 100 km je Miettag wie bisher (16 Tage = 1.600 km), danach 0,45 €/km.
- Die Seite Langzeitmiete und ihr Rechner nutzen genau dieselben Preise, damit überall das Gleiche steht.
- Bestehende Buchungen, Rechnungen und offene Zahlungen behalten ihre alten Preise.

## 3. Abholort überall „Poststraße 63“
Texte und Mails stehen schon auf 63. Bei allen fünf Transportern ist in den Fahrzeugdaten aber noch „Poststraße 60, 71229 Leonberg“ eingetragen (das sieht man bei der Fahrzeugauswahl). Das wird auf „Poststraße 63, 71229 Leonberg“ geändert, danach wird alles noch einmal auf eine übrig gebliebene „60“ durchsucht.

## Technische Details
- `booking-rules.ts`: `getAvailablePlans` für nights ≥ 8 liefert dynamischen Tarif `days_<N>` (N = Nächte, 8–29) via `getPlanById` (Preis = floor(N/7)·Woche + Rest-Tarif, min mit ceil(N/7)·Woche; freeKm 100·N); ab 30 → `days_<N>` mit Langzeitstaffel aus `long-term.ts` (Anker angepasst, 7-Tage-Anker = Wochenpreis). `week_xN` bleibt für Altbuchungen auflösbar.
- `multi_7d`-Preise anheben; neue Katalogversion für km/Preis-Snapshot (Altbuchungen über Snapshots geschützt).
- Server-Checkout, Verfügbarkeit (`blockInterval`/`planBlockDurationMs`), Rückgabe-/Kalenderzeiten nutzen automatisch `getPlanById` → Tests für 8, 13, 14, 16, 29, 30, 45 Tage und Altplan `week_x3`.
- Migration: `UPDATE vehicles SET pickup_address='Poststraße 63, 71229 Leonberg' WHERE pickup_address='Poststraße 60, 71229 Leonberg'`.
- Preis-Memory aktualisieren.
