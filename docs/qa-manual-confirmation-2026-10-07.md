# QA – Kundenbestätigung manueller Termine (07.10.2026)

## Umgesetzt
- Sendeabsicht (`confirmation_requested`) wird im selben Datenbank-Schreibvorgang wie der Termin gespeichert. Der Versand läuft serverseitig im Speicher-Request für genau die gespeicherte Revision. Ein Mailfehler wird nie als Speicherfehler gemeldet.
- Neue Termine tragen eine stabile `create_request_id` (Unique-Index). Eine wiederholte Anfrage gibt die bestehende Zeile zurück und ändert nichts. Eine identische Bearbeitung erzeugt keine neue Revision; die Sendeabsicht allein ebenfalls nicht.
- Serverseitige Pflichtprüfung: Preis bei Neuanlage; gültige E-Mail, wenn Bestätigung oder Kunden-Erinnerung gewählt ist; Adminrolle.
- `manual_reservation_customer_mails.payload` friert from/to/reply_to/subject/html/text je Revision ein (Trigger sperrt Änderungen an payload, Empfänger und Schlüssel). Wiederholungen senden exakt diesen Inhalt.
- DB-Funktionen `claim_/complete_/fail_customer_confirmation` mit Lease-Token: Ein Versuch gilt vor dem externen Aufruf als unklar; Abschluss und Fehler gelten nur mit passendem Token, ein veralteter Worker kann keinen Erfolg überschreiben. Unklare oder abgebrochene Versuche älter als 23 h → `needs_review`, kein Versand.
- „Angenommen, Status nicht gespeichert“ wird als eigener Zustand angezeigt, nicht als „nicht gesendet“.
- Erfolg nur mit echter, nicht-leerer String-ID des Anbieters. HTTP 5xx, Timeout, Netzfehler und Absturz gelten als unklar.
- `parseEuroToCents` lehnt `,`, `.`, `129,`, `,50` und eingebettete Fremdzeichen ab; `0` bleibt erlaubt. Die Vorlage verweigert unvollständige Daten statt 0 €.
- Admin-Zeiteingaben werden immer als Europe/Berlin ausgewertet (`src/lib/berlin-input.ts`). Sommerzeit-Lücken und doppelte Stunden werden abgelehnt.
- Die Schlüsselübergabe-Art je Fahrzeug ist unverändert. Die Geschäftsadresse ist unverändert.

## Migration
`0001_customer_confirmation_fencing_and_frozen_payload` angewendet (rein additiv, keine Datenänderung, keine Altbuchungen aufgefüllt).

## Ergebnisse (echte Exit-Codes)
- Typecheck: Exit 0
- Vitest: 62 Dateien, 738/738 bestanden, Exit 0. Neue Dateien: `manual-confirmation.test.ts`, `manual-upsert-validation.test.ts`, `manual-upsert-handler.test.ts`.
- Web-Build: Exit 0
- Browser-Prüfung (Google, Awin und Resend blockiert): /, /kontakt, /faq, /transporter-mieten-pforzheim-calw, /mietratgeber → HTTP 200; zeigen „Poststraße 60“, weder „Grunbach“ noch „Römerstraße“.

## Nachtrag Geschäftsadresse (07.10.2026)
- Zentrale Konstanten in `src/lib/seo.ts`: `BUSINESS_OFFICE`/`BUSINESS_OFFICE_ADDRESS` (Calwer Straße 29, 75331 Engelsbrand-Grunbach) getrennt von `PICKUP_ADDRESS` (Poststraße 60, 71229 Leonberg).
- Umgestellt: Impressum inkl. Metabeschreibung, AGB-Vertragsparteien, Datenschutz-Verantwortlicher, Kontakt (eigener Block „Geschäftsstelle (keine Fahrzeugabholung)“), Mail-Footer, Kopf/Fuß neu erzeugter Rechnungen und Angebote. Archivierte PDFs unverändert.
- Strukturierte Daten: AutoRental-Adresse bleibt bewusst der Abhol-/Mietort Leonberg (lokales Geschäft).
- „Römerstraße 36“ steht nur noch in Test-Fixtures und alten QA-Dokumenten.
- Danach: Typecheck Exit 0, Vitest 738/738 Exit 0, Web-Build Exit 0. Keine Mails ausgelöst.

## Offen
- `RESEND_API_KEY` ist weiterhin ungültig (nicht erneut geprüft): Ein Mailversand ist live erst nach Austausch des Schlüssels möglich.
- AGB §-Gerichtsstand nennt weiterhin „Leonberg“ – rechtliche Entscheidung des Eigentümers, nicht geändert.
- Admin-Kalender nicht im Browser getestet (es gibt keine Testumgebung ohne Schreibzugriff auf echte Daten). Native-Build in dieser Runde nicht ausgeführt.
- Nicht veröffentlicht.
