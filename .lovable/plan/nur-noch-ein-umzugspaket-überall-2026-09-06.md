# Nur noch ein Umzugspaket – überall

Ziel: Auf der ganzen Seite gibt es genau ein Zusatzpaket, das „Umzugspaket“ für 29 €, mit identischem Inhalt, identischer Optik und identischem Preis in Buchung, Preisübersicht, Zahlung, Bestätigungen und Rechnungen.

## Was bereits stimmt

- Das Paket wird aus einer einzigen Quelle geladen: „Umzugspaket“, 29 €, mit 2 dicken Spanngurten, 4 dünnen Zurrgurten, 1 Rolle Klebeband/Panzertape, 1 Paar Handschuhen, 5 Umzugsdecken.
- Preisübersicht, Über-uns-Seite und Buchung zeigen dieses eine Paket über denselben Baustein, also gleiche Optik.
- Die Zahlung nimmt den Preis direkt aus dieser Quelle, es wird also automatisch 29 € berechnet; Rechnungen und Bestätigungen übernehmen den gebuchten Paketstand.

## Was noch angepasst wird

1. Nebentexte auf das neue Paket vereinheitlichen:
   - Preisübersicht: Zeile „Zubehör wie Spanngurte und Umzugsdecken optional als Zusatzpaket“ → „Umzugspaket mit Spanngurten, Zurrgurten, Decken, Klebeband und Handschuhen optional für 29 €“.
   - Buchungs-Infobereich: „Zubehör (Spanngurte, Decken, Rollbrett) optional als Zusatzpaket buchbar“ → gleiche neue Formulierung; „Rollbrett“ entfällt, da nicht im Paket.
   - Wo von „Paketen“ im Plural die Rede ist (Hinweistext unter dem Paket, Buchungsüberschriften), auf Singular „Umzugspaket“ umstellen.
2. AGB-Abschnitt prüfen und bei Bedarf auf genau ein Paket mit 29 € und dem aktuellen Inhalt schärfen.
3. Sicherstellen, dass die Zahlungsposition im Bezahlvorgang eindeutig „Umzugspaket“ mit 29 € heißt.
4. Gesamte Seite nach alten Paketnamen, alten Preisen und Plural-Formulierungen durchsuchen und Reste entfernen.
5. Bestehende, früher gebuchte Aufträge behalten ihre gespeicherten Paketdaten und Preise – dort wird nichts nachträglich verändert.

## Technische Details

- Einzige Preis-/Inhaltsquelle bleibt `src/lib/addons.ts` (`ADDONS`, `ADDON_NOTE`, `ADDON_TRUST`).
- Textanpassungen in `src/routes/preise.tsx`, `src/components/BookingInfoSection.tsx`, `src/components/AddonPackagesSection.tsx`, `src/components/BookingSection.tsx`, `src/routes/agb.tsx`.
- Stripe: `src/lib/payments.functions.ts` erzeugt die Zeile per `price_data` aus `getAddonById`, Betrag = 2900 Cent; Label auf „Umzugspaket“ vereinheitlichen. Keine neuen Stripe-Produkte/Preise nötig.
- Abschluss: `bunx tsgo --noEmit`, Produktionsbuild und Sichtprüfung von Preisübersicht, Über uns und Buchung.
