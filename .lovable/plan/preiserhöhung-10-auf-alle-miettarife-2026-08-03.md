# Preiserhöhung: +10 € auf alle Miettarife

Alle Miettarife werden ab sofort um 10 € angehoben. Bestehende und bereits geplante Buchungen bleiben unverändert, weil jede Buchung ihren Preis beim Abschluss fest gespeichert hat. Die Kaution bleibt bei 200 €.

## Neue Preise

| Tarif | alt | neu |
|---|---|---|
| 3 Stunden Express | 39 € | 49 € |
| 6 Stunden Umzug Mini | 59 € | 69 € |
| 24 Stunden Umzugstag | 89 € | 99 € |
| 24 Stunden Langstrecke | 119 € | 129 € |
| 2 Tage Kurzprojekt | 159 € | 169 € |
| 3 Tage Umzug Plus | 219 € | 229 € |
| 4 Tage Renovierungs-Tarif | 289 € | 299 € |
| 5 Tage Projektwoche Mini | 349 € | 359 € |
| 6 Tage Projektwoche | 399 € | 409 € |
| 7 Tage Wochenmiete | 449 € | 459 € |

Mehrwochen-Mieten (2× / 3× Wochenmiete) rechnen automatisch mit dem neuen Wochenpreis (z. B. 2 Wochen = 918 €).

Unverändert bleiben: Kaution 200 €, Freikilometer, Mehrkilometer-Preise (0,39 / 0,35 / 0,29 €), Zusatzpakete (19 € / 49 €), Kilometer-Tarif 0,90 €/km.

## Was angepasst wird

1. **Tarif-Katalog** (`src/lib/booking-rules.ts`): die zehn Preise erhöhen. Damit ziehen automatisch alle Stellen mit: Tarif-Übersicht auf der Startseite, Buchungsstrecke, Vergleichs-Sektion, Stripe-Zahlbetrag, Rechnungen und Admin-Ansichten.
2. **AGB § 4 „Preise und Tarife"** (`src/routes/agb.tsx`): Preisliste auf die neuen Beträge aktualisieren.
3. **FAQ** (`src/routes/faq.tsx`): dort stehen noch veraltete Beträge (100 € / 150 €), die zu keinem aktuellen Tarif passen — diese Texte werden auf die neuen echten Tarife umgeschrieben.

## Bestehende Buchungen

Es wird nichts in der Datenbank geändert. Bezahlte und geplante Buchungen behalten den gespeicherten Preis (inkl. Rechnung, Kaution, Freikilometer). Nur neue Buchungen ab jetzt nutzen die neuen Preise.
