# Kaution: Betragsfeld bei Abzügen verständlich machen

## Was los ist (am Screenshot belegt)
Bei „Fehlender Kraftstoff" steht im **Betragsfeld** der Satz „20 euro reine Tankkosten die gefehlt haben laut Kunde danach.". Das Feld erwartet nur eine Zahl. Den Satz kann das System nicht als Betrag lesen, deshalb rechnet es mit 0 € Tankkosten (rechts stehen nur die 20 € Servicegebühr) und der Knopf bleibt grau. Das Feld hat keine eigene Beschriftung, man sieht nicht, dass es ein reines Zahlenfeld ist.

Sofort-Lösung ohne Änderung: im ersten Feld nur `20` eintragen und den Satz ins Feld „Begründung" darunter schreiben.

## Was ich ändere
1. **Feste Beschriftung über jedem Feld**: „Tankkosten in € (nur Zahl)" bzw. „Betrag in € (nur Zahl)" und „Begründung (für Kunden sichtbar)". So verschwindet der Hinweistext nicht mehr beim Tippen.
2. **Zahl aus Text erkennen**: Steht im Betragsfeld z. B. „20 euro …" oder „20,50 €", wird die erste Zahl genommen (20 bzw. 20,50). Gibt es mehrere Zahlen oder gar keine, wird nichts geraten.
3. **Deutlicher Hinweis direkt am Feld**: Ist die Eingabe keine eindeutige Zahl, steht unter dem Feld „Bitte nur den Betrag als Zahl eingeben, z. B. 20". Derselbe Text erscheint in der Liste über dem Rückzahlungsknopf.
4. Gilt für alle Abzüge mit freiem Betrag (Kraftstoff, Reinigung, Beschädigung, Zubehör, Verlängerung).

Unverändert bleiben: Rückzahlungsablauf, Stripe, Schutz gegen doppelte Erstattung, 20 € Servicegebühr, Kundenmail.

## Technisch
- Neue reine Funktion `parseLenientEuro(text)` in `src/lib/deposit-refund-block.ts`: gibt Cent zurück, wenn genau eine Zahl gefunden wird, sonst `null`. Tests: „20" → 2000, „20 euro reine Tankkosten" → 2000, „20,50 €" → 2050, „Tank leer" → null, „20 oder 30" → null.
- `DepositsAdmin.tsx`: `lineOf`, Rahmen-Markierung und Entwurfsdaten (`draftItems`) nutzen diese Funktion statt `toCents` für Betragsfelder; der gespeicherte Betrag ist immer die erkannte Zahl. Labels per `<label>` über den Feldern, Feldfehler direkt darunter.
- Bestehende Tests für Kautionsabschluss laufen weiter, neue Tests für die Erkennung.
