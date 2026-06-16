## Ziel
Eine schnelle Möglichkeit, den Live-Bezahlvorgang mit 1 € zu testen.

## Plan
1. Im Admin-Bereich (`/admin`) eine kleine Karte „Zahlungs-Test (1 €)" hinzufügen – nur sichtbar für dich als Admin.
2. Button „1 € Testkauf starten" öffnet den eingebetteten Stripe-Checkout (gleicher Flow wie eine echte Buchung).
3. Auf der Server-Seite eine eigene `createTestCheckout`-Serverfunktion, die eine einmalige 1-€-Zahlung via `price_data` erstellt (kein neues Produkt im Katalog nötig). Geschützt mit `requireSupabaseAuth` + Admin-Rollencheck, damit niemand sonst den Endpoint nutzen kann.
4. Nach erfolgreicher Zahlung Rücksprung auf eine kurze Bestätigungsseite.

## Hinweis
- Im Preview läuft das im Test-Modus (Stripe-Testkarte `4242 4242 4242 4242`).
- Auf `mytransporter.org` (Live) wird **wirklich 1 €** abgebucht – ideal um zu prüfen, ob der Checkout in Produktion sauber durchläuft. Geld kannst du dir danach in Stripe per Rückerstattung zurückholen.

Soll ich es so umsetzen?
