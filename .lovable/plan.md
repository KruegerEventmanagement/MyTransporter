# Kautionsseite mit Dokument-Vorschau, Bewertungsmail ohne Häkchen

## 1. Kundendokumente als Vorschau in der Kautionsansicht
- Wenn du eine Kaution bearbeitest, siehst du Ausweis und Führerschein des Kunden direkt als Bild in der Seite, nicht mehr nur als Link.
- Die Bilder kann man nicht anklicken. Sie sind einfach immer sichtbar, damit klar ist, um wen es geht.
- Hat der Kunde ein Dokument entfernt oder fehlt es, steht dort wie bisher ein Hinweis statt eines Bildes.
- Die Bilder sind wie bisher nur für dich als Admin abrufbar und nur kurz gültig.

## 2. Bewertungsmail automatisch, ohne Häkchen beim Buchen
- Das Häkchen "Ich möchte eine Bewertungsanfrage bekommen" fällt bei der Buchung weg.
- An seiner Stelle steht ein kurzer Hinweis: Nach der Miete kommt eine Feedback-Mail, die man jederzeit abbestellen kann. Der Abmeldelink bleibt in jeder Mail.
- Jede neue bezahlte Buchung bekommt automatisch einen Nachweis: "Telefonische Zustimmung beim Betreiber eingeholt". Er wird so gespeichert wie deine Bestätigung vom 23.10. Damit geht die Mail 24 Stunden nach Mietende automatisch raus.
- Bei manuell eingetragenen Buchungen ist das Häkchen "Zustimmung" künftig schon gesetzt. Du kannst es bei Bedarf abwählen.
- Diese Regeln bleiben bestehen: Rainer, Moein Baghery und Ante Mihalj sind gesperrt, wer sich abgemeldet hat, bekommt nichts, und niemand bekommt zwei Mails.
- Hinweis: Der Nachweis beruht auf deiner Zusage, dass du jeden Kunden vorher anrufst. Wenn du einmal nicht anrufst, sag es mir oder wähle das Häkchen bei der manuellen Buchung ab.

## Technische Details
- In `DepositsAdmin.tsx` wird `docLink` zu einer Bildvorschau (`<img>` mit festem Seitenverhältnis, `pointer-events-none`, ohne `<a>`). Die Daten kommen weiter aus `getCalendarEntryDetails` (signierte URLs), dort ändert sich nichts.
- In `BookingSection.tsx` wird die Checkbox entfernt und durch einen Hinweistext in allen 7 Sprachen ersetzt. Der Checkout sendet keine `reviewConsent` mehr.
- Im Webhook wird nach der bestätigten Zahlung idempotent ein `review_mail_consents`-Eintrag mit `origin` "operator_phone" und neuer `consent_version` angelegt. Ältere Sessions behalten ihren alten Wert.
- `CalendarAdmin`: `reviewConsent` ist dort standardmäßig `true`.
- Tests: Ein neuer Checkout ohne Häkchen gilt als eingewilligt. Die Sperrliste und Abmeldungen blockieren weiterhin. Die Dokumentvorschau hat keine Links.
