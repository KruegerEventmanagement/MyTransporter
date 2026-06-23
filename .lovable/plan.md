Ich kümmere mich um zwei Dinge:

1. **E-Mails für die letzte Buchung jetzt nachschicken** — die Express-Buchung über 39 € vom 23.06., Abholung 25.06. 15:00 Uhr, Code OG312T. Du bekommst an `krueger.christian96@gmx.de` die normale Kundenbestätigung und an `info@mytransporter.org` die Admin-Benachrichtigung, beide so wie sie zukünftige Kunden sehen würden.

2. **Rechnung als PDF anhängen** — ab sofort (und auch in der nachgeschickten Bestätigung oben) hängt an der Kundenbestätigung eine echte Rechnungs-PDF mit:
   - Rechnungsnummer (abgeleitet aus Buchungs-ID + Datum)
   - Rechnungs- und Leistungsdatum
   - Kunde (Name + E-Mail)
   - Anbieter (MyTransporter · info@mytransporter.org)
   - Posten: Miete (Tarif-Label), gebuchtes Zubehör, Kaution (mit Hinweis „wird nach Rückgabe erstattet")
   - Zwischensumme, MwSt-Hinweis (Kleinunternehmerregelung §19 UStG, falls nicht anders gewünscht), Gesamtbetrag, Zahlart „bereits per Karte bezahlt"
   - Hinweis: Die Kaution ist Bestandteil der Zahlung, wird aber bei korrekter Rückgabe in voller Höhe erstattet.

Technische Umsetzung (kurz):
- Neue Server-Funktion `generateBookingInvoicePdf(bookingId)` erzeugt das PDF mit `pdf-lib` (läuft im Worker-Runtime).
- `sendBookingConfirmation` hängt das PDF bei Resend als Attachment an und nennt es `MyTransporter-Rechnung-<Code>.pdf`.
- Einmaliger Trigger für die aktuelle Buchung `f8f86b64…`: ich rufe nach dem Deploy `sendBookingConfirmation` + `sendAdminBookingNotification` einmal manuell auf, damit du beide Mails sofort im Postfach hast.

Frage zur MwSt-Konfiguration: Soll auf der Rechnung
- (A) **Kleinunternehmer** ausgewiesen werden („Gemäß §19 UStG wird keine Umsatzsteuer berechnet."), oder
- (B) **19 % MwSt.** mit ausgewiesener Steuer auf den Mietanteil (Kaution bleibt steuerfrei)?

Wenn du nichts angibst, nehme ich Variante A (Kleinunternehmer), das passt zur typischen Setup-Größe — du kannst es jederzeit umstellen.