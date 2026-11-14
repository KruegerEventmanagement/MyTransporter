# Bewertungsmails: alle Kunden, außer Moein Baghery und Ante Mihalj

## Was ich gefunden habe
- Ja, Kunden bekommen die Bewertungsmail schon automatisch, 24 Stunden nach Mietende. Seit dem 23.10. sind 16 Stück rausgegangen.
- **Moein Baghery** hat am 08.11. schon eine bekommen. Das lässt sich nicht mehr rückgängig machen. Ab jetzt bekommt er aber keine mehr.
- **Ante Mihalj** hat noch keine bekommen. Er wird ab jetzt dauerhaft ausgeschlossen.

## Was ich mache
1. Ich sperre Moein Baghery und Ante Mihalj dauerhaft für Bewertungsmails. Das gilt auch für spätere Buchungen und wird genauso gespeichert wie die bestehende Sperre für Rainer.
2. Ich suche alle echten Kunden, deren Miete seit dem 12.10. zu Ende ist und die noch keine Bewertungsmail bekommen haben. Dabei gilt:
   - Wer schon eine bekommen hat, bekommt keine zweite. Das gilt auch für die 26 Mails aus der Aktion im Oktober.
   - Rainer, Fatih, die beiden Neuen, gelöschte Konten, Testkonten und Abmeldungen bleiben draußen.
   - Angeschrieben wird nur, wer zugestimmt hat (bei der Buchung oder durch die telefonische Zustimmung vom 23.10.).
3. Bevor irgendetwas rausgeht, zeige ich dir die Liste mit Namen. Erst wenn du sie freigibst, verschicke ich die Mails über den normalen Versandweg. Dabei schickt jeder Versand höchstens eine Mail pro Person.
4. Zum Schluss prüfe ich die Versandbestätigungen und die Meldungen über nicht zustellbare Mails.

## Technische Details
- Die Sperrliste wird geprüft, bevor eine neue Feedback-Mail eingeplant wird (Abgleich über E-Mail-Adresse und Konto), und noch einmal direkt vor dem Versand. Dazu kommt ein Regressionstest: Gesperrte Adressen landen nie in der Warteschlange.
- Fehlende Mails werden nur über `customer-mail-outbox.server.ts` nachgeholt. Erkannt wird jede Buchung nur einmal, damit nichts doppelt verschickt wird.
