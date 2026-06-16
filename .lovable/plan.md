## Was ich tun werde

Aktueller Stand: Stripe go-live ist abgeschlossen (alle 5 Schritte ✓), Live-Schlüssel sind hinterlegt, der Checkout-Code sieht sauber aus. Trotzdem hat dein Kunde nicht zahlen können. Ich brauche den **echten Fehler**, sonst rate ich nur.

### Schritt 1 – Live-Zahlung selbst simulieren
Ich öffne deinen veröffentlichten Shop (`mytransporter.org`) im Browser-Tool und gehe den Buchungsablauf wie ein echter Kunde durch:
- Datum/Uhrzeit/Tarif wählen
- Fahrzeug + Adresse + Telefon eingeben (Test-Daten)
- Auf "Sicher bezahlen" klicken
- Den Embedded-Stripe-Dialog laden lassen

Dabei lese ich:
- die genaue Fehlermeldung aus der Browser-Konsole
- die Netzwerk-Antwort von Stripe (`/_serverFn/...`)
- die Server-Logs auf der Live-Domain

Wichtig: Ich **breche vor dem Bezahlen ab**, sobald der Stripe-Dialog erscheint – es wird also keine echte Zahlung ausgelöst.

### Schritt 2 – Ursache eingrenzen
Die wahrscheinlichsten Fehlerquellen sind:

1. **Live-Konto noch nicht vollständig aktiv** – Stripe gibt dann beim Erstellen der Checkout-Session einen Fehler wie *"Your account cannot currently make live charges"*.
2. **Kaution + Miete in einer Session, aber `customer_creation: "always"` zusammen mit `customer_email`** – manche Stripe-Konten lehnen diese Kombination ab.
3. **Embedded-Checkout-Konfiguration** – z. B. eine Domain, die in Stripe noch nicht freigeschaltet ist.
4. **`setup_future_usage: "off_session"`** auf einem Konto, bei dem das Saving-Card-Feature noch nicht aktiviert ist.

### Schritt 3 – Fixen + erneut simulieren
Sobald ich die Fehlermeldung habe, passe ich `src/lib/payments.functions.ts` so an, dass der Checkout durchläuft, und teste erneut – diesmal mit Stripe-Testkarte `4242 4242 4242 4242` im Sandbox-Modus (Preview), um sicher zu sein, dass am Ende eine erfolgreiche Buchung in der Datenbank ankommt.

### Schritt 4 – Bericht an dich
Am Ende sage ich dir auf Deutsch in einem Satz:
- was kaputt war
- was ich geändert habe
- ob du noch irgendwo (z. B. in deinem Stripe-Konto) etwas freischalten musst

### Technische Notiz (für den Code)
Betroffene Datei: `src/lib/payments.functions.ts` (`createBookingCheckout`). Mögliche Anpassungen je nach Fehler: `customer_creation` entfernen, `setup_future_usage` konditional setzen, `payment_method_types` explizit auf `["card"]` setzen, oder `customer` per `customers.create` vorher anlegen statt `customer_email`.
