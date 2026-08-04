# Haftungs-Hinweis vor der Zahlung anpassen

## Ziel
Den Versicherungs-/Haftungs-Hinweis direkt vor dem Bezahl-Button (Buchung Schritt 5) so umschreiben, dass nicht mehr steht, das Fahrzeug hätte „keine Teilkasko / keine Vollkasko“. Stattdessen wird die Selbstbeteiligung von bis zu 1.000 € im Schadensfall kommuniziert.

## Geplanter neuer Text im Bezahlbereich

> **Versicherung / Haftung erklärt und verstanden**
>
> Im Schadenfall trägt der Mieter bis zu 1.000,00 Euro maximale Selbstbeteiligung. Ist der Schaden geringer, trägt er nur diesen Schaden. Notwendige, tatsächlich angefallene Nebenkosten, z. B. Gutachterkosten, Abschleppkosten, Bergungskosten, Standkosten oder behördliche Gebühren, kommen zusätzlich hinzu.

## Technische Umsetzung
1. In `src/components/BookingSection.tsx` (Schritt 5, Checkbox-Label für „Versicherung / Haftung erklärt und verstanden") den alten Satz entfernen und durch den neuen Wortlaut ersetzen.
2. (Optional, falls gewünscht) Den gleichen Wortlaut in `src/routes/agb.tsx` § 9 angleichen, damit AGB und Buchungs-Hinweis konsistent sind.

## Abgrenzung
- Der Abschleppkosten-/Nebenkosten-Satz bleibt erhalten, wie gewünscht.
- Die Checkbox-Pflicht („muss akzeptiert werden") bleibt bestehen.
- Preise, Kaution und Zahlungsablauf bleiben unverändert.
