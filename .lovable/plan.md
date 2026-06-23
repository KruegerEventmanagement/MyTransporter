## Änderung Rechnungs-PDF: 19% MwSt. ausweisen

In `src/lib/invoice-pdf.server.ts`:

1. **Beträge als Brutto behandeln** (so wurden sie bereits gezahlt) und MwSt. herausrechnen:
   - Miete brutto: `plan_price` → netto = brutto / 1,19 · MwSt. = brutto − netto
   - Zubehör brutto: pro Position gleich aufteilen
   - **Kaution: keine MwSt.** (echte Sicherheitsleistung, kein Leistungsentgelt) – bleibt unverändert
2. **Positionsliste umbauen** in eine kleine Tabelle mit Spalten: Position · Netto · MwSt 19% · Brutto. Kaution-Zeile zeigt nur Brutto, MwSt-Spalte „—".
3. **Summenblock**:
   ```
   Zwischensumme netto (Miete + Zubehör)
   zzgl. 19% USt.
   Bruttobetrag Leistung
   Kaution (umsatzsteuerfrei, § 10 UStG)
   Gesamtbetrag (bereits per Karte bezahlt)
   ```
4. **Hinweis „§ 19 UStG / Kleinunternehmer" entfernen** und ersetzen durch: „Im ausgewiesenen Brutto sind 19% Umsatzsteuer enthalten. Die Kaution ist gemäß § 10 UStG nicht umsatzsteuerbar und wird nach beanstandungsfreier Rückgabe vollständig erstattet."
5. **Steuernummer/USt-IdNr.-Zeile** im Header-Footer: Platzhalter `USt-IdNr.: <wird ergänzt>` – falls du sie schon hast, sag mir die Nummer, dann trage ich sie fest ein (rechtlich Pflichtangabe auf MwSt-Rechnungen).
6. **Rundung**: alle Beträge auf 2 Nachkommastellen, in Cent rechnen um Rundungsdifferenzen zu vermeiden.

Keine Änderung an `booking-emails.functions.ts` nötig – die PDF wird weiterhin automatisch angehängt.

## Optional: Test-Mail neu schicken

Nach dem Umbau einmalig die Buchung `f8f86b64-…` erneut an dich verschicken, damit du die neue Rechnung siehst.

## Spam-Ordner – was wir tun können

Ich kann am Code wenig drehen, aber an der Domain-Konfiguration. Mögliche Ursachen, wenn die Mail im Spam landet:

- **SPF / DKIM / DMARC** für `mytransporter.org` bei Resend → wenn nicht alle drei „verified" sind, landet fast jede transaktionale Mail im Spam. Soll ich den aktuellen Status der Email-Domain prüfen?
- **From-Adresse** `info@mytransporter.org` ist gut, **Reply-To** identisch – passt.
- **PDF-Anhang + viele Links** triggert teilweise Spamfilter; kaum vermeidbar bei einer Rechnung.

Wenn du willst, prüfe ich nach dem MwSt-Umbau zusätzlich den Domain-Status und melde, was noch fehlt (z.B. DMARC-Record).

## Frage

Soll auf der Rechnung eine **USt-IdNr.** oder **Steuernummer** stehen? Wenn ja, bitte einmal mitschicken – ohne diese Angabe ist eine MwSt-Rechnung formal unvollständig. Bis dahin setze ich einen Platzhalter.
