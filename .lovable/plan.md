## Haftungs-Checkbox vor Bezahlung

Im Buchungs-Flow (`src/components/BookingSection.tsx`), Schritt 4 „Bezahlen", wird **direkt über dem „Sicher bezahlen"-Button** eine Pflicht-Checkbox eingefügt.

### UI

- `Checkbox` (shadcn) + `Label` mit folgendem Text:

  > **Versicherung / Haftung erklärt und verstanden**
  > Der Mieter bestätigt, dass das Mietfahrzeug keine Teilkasko und keine Vollkasko hat. Bei erheblichen selbstverschuldeten Schäden trägt der Mieter den tatsächlichen Fahrzeugschaden bis maximal 1.000,00 Euro pro Schadensfall. Ist der tatsächliche Schaden niedriger, wird nur der niedrigere Schaden berechnet. Notwendige, tatsächlich angefallene Nebenkosten, z. B. Gutachterkosten, Abschleppkosten, Bergungskosten, Standkosten oder behördliche Gebühren, kommen zusätzlich hinzu.

- Überschrift „Versicherung / Haftung" fett, Restext kleiner.
- Checkbox erscheint erst, wenn Verifizierung abgeschlossen ist (also wenn ohnehin der Bezahl-Block sichtbar ist).

### Logik

- Neuer State `liabilityAccepted` (boolean, default `false`).
- „Sicher bezahlen"-Button bleibt zusätzlich zur bisherigen Bedingung **disabled**, solange `liabilityAccepted === false`.
- Beim Wechsel weg von Schritt 4 / nach erfolgreicher Zahlung wird der State zurückgesetzt.

### Nicht im Umfang

- Keine Datenbankspalte, keine serverseitige Speicherung — reine UI-Pflichtbestätigung vor dem Stripe-Checkout (analog zur bestehenden „Zubehör vollständig"-Checkbox im Rückgabe-Flow).
