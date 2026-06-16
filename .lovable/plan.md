## Problem
In Schritt 4 (Bezahlung) zeigt die Zusammenfassung unter "Zu zahlen" nur `Miete + Kaution`, obwohl der angezeigte Gesamtbetrag bereits das ausgewählte Zubehör enthält. Dadurch wirkt es, als fehle das Zubehör.

In Schritt 3 ("Grundbetrag") wird das Zubehör bereits korrekt mit aufgelistet (`+ X € Zubehör`).

## Änderung
Datei: `src/components/BookingSection.tsx`, Zeile 1149.

Die Aufschlüsselung in Schritt 4 wird an Schritt 3 angeglichen, sodass das Zubehör nur dann erscheint, wenn welches gewählt wurde:

```
{selectedPlanEntry && `${selectedPlanEntry.price} € Miete${
  addonsTotal > 0 ? ` + ${addonsTotal} € Zubehör` : ""
} + ${DEPOSIT} € Kaution`}
```

Der Gesamtbetrag (`total`) bleibt unverändert – er ist bereits korrekt berechnet (Miete + Zubehör + Kaution). Es ändert sich nur die Anzeige der Aufschlüsselung.

## Keine weiteren Änderungen
- Keine Logik-Änderungen, keine Stripe-Änderungen, keine Backend-Änderungen.
- Tatsächlich abgebuchter Betrag bleibt identisch.
