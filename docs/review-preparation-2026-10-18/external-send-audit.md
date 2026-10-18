# Abschlussnachweis: externer Bewertungsversand am 18.10.2026

## Ergebnisergänzung: dauerhafter Zustellfehler Claudia Seuffert

**26 Gmail-Annahmen/SENT, davon 1 bekannter dauerhafter Zustellfehler und 25 ohne bisher bekannte Fehlermeldung. SENT ist kein Zustellnachweis; auch die 25 sind nicht als zugestellt bestätigt.**

Quelle: neue Betreiberinformation über Roots anschließendes Gmail-DSN-Nachlesen, keine erneute Gmail-Abfrage durch Lovable. DSN `1a14faccb704cd89`, Date **18.10.2026 15:41:26 UTC**, From **Mail Delivery Subsystem <mailer-daemon@googlemail.com>**, Final-Recipient **seuffertc@icloud.com**, Action **failed**, Status **5.1.1**, Remote-MTA **mx01.mail.icloud.com**, Antwort **550 5.1.1 user does not exist**. Bezug: Claudias angenommene Originalnachricht `1a14facbde08bb05`, 15:41:22 UTC, Quelle `71296565-0ecb-4b8f-a352-d6940ff73f50`.

Im bestehenden Nachweis wurde ausschließlich die Ergebnisannotation ergänzt: `error_kind=permanent_bounce`, DSN-Quelle in `last_error`, kein automatischer Wiederholungsversand an die ungültige Adresse in `blocked_reason`. Originale Provider-ID, Annahmezeit und `status=sent` bleiben wahr und unverändert; **sent beschreibt hier Gmail-Annahme, nicht erfolgreiche Zustellung**. Keine fingierten Provider-Attempts, kein Retry und keine Kundenwiderrufs-/Opt-out-Umschreibung. Root sucht laut Betreiber nur eine bestätigte Ersatzadresse; bislang keine vorhanden, keine Adresse geraten oder geändert.

**Bestehende technische Grenze:** Weder Schema noch geprüfte Mailpfade besitzen einen separaten adressweiten permanenten Bounce-/Suppression-Mechanismus. Der bereits endgültige sent-Eintrag verhindert reguläre Wiederholung dieser Buchungsquelle; die Ergebnisannotation allein ist keine adressweite Sperre für spätere andere Buchungen/Mailarten. Keine neue Versandarchitektur eingeführt. Bis zur bestätigten Korrektur darf seuffertc@icloud.com nicht automatisch erneut verwendet werden; dies ist dauerhaft als Anforderung dokumentiert, kein Kunden-Opt-out.

## Quelle und tatsächlicher Versand

Quelle: Betreiberbericht im Nutzerauftrag um 15:42 UTC; unabhängiger nativer ChatGPT-Gmail-Connector. Laut Betreiber wurden 26 zusätzliche Nachrichten am 18.10.2026 15:40:17–15:41:49 UTC gesendet und alle mit `batch_read_email` aus SENT wieder gelesen. Abschließende Betreffsuche: 26; Review-Suche an Rainer: 0. Lovable hat Gmail hier nicht erneut aufgerufen und behauptet keine Empfängerpostfach-Zustellung.

Exakt 25 prepared-Entwürfe plus Tanja separate_contact aus recipients.csv, je ein To, keine CC/BCC. From: Christian Krüger – MyTransporter <info@mytransporter.org>; Reply-To: info@mytransporter.org; Betreff: Danke für deine Buchung! Wie war deine Erfahrung? Offizielles Logo, verifizierter Google-Link, sichtbare Mailto-Abmeldung und Antwortmöglichkeit laut Betreiber in jeder Mail bestätigt. Textversion nur auf normale Leerzeilen verdichtet. Tatsächlich KEIN List-Unsubscribe-Header, da der native externe Connector keine benutzerdefinierten Header unterstützt; keine erfundenen HTTP-Tokens. Header im draft-manifest.json bleiben historische Entwurfsvorschläge und sind keine Behauptung tatsächlich gesendeter Header.

## Sichere abgeschlossene Nachregistrierung

27 neue customer_mail_outbox-Zeilen wurden direkt ausschließlich als sent eingefügt, normaler Schlüssel mt-review_request-{source_type}-{source_id}, echte Empfänger, Gmail-IDs und Versandzeiten. Es gab keine vorherige scheduled/pending/processing-Phase. Keine Enqueue-, Claim-, Complete-, Send-, Sweep- oder Jobfunktion aufgerufen. Keine vorhandenen Zeilen verändert; Konflikte bleiben unverändert. Keine Architektur-/Schemaänderung.

Payload bleibt NULL: kein erfundener eingefrorener Sendepayload und keine falschen Header. Keine Hashes, keine mail_provider_attempts, keine erfundenen internen Versuche oder Leases. attempts=0 bedeutet ausschließlich keine internen Outbox-Versuche, nicht dass die externe Nachricht ungesendet wäre. mail_provider=gmail; sent_at ist die echte vom Betreiber übermittelte Versandzeit, created_at der Zeitpunkt der Nachregistrierung. due_at wurde nur zur Erfüllung des Pflichtfeldes gleich sent_at gespeichert; kein Versandplan. Der automatisch erzeugte opt_out_token ist nur der bestehende Tabellenstandard, wurde nirgendwo in externe Nachrichten eingesetzt und nicht als versendeter HTTP-Abmeldelink behauptet.

Provenienz besitzt keine eigene Outbox-Spalte: dieser Bericht und external-sends.json erhalten die externe Quelle und das autorisierte Änderungsprotokoll. Keine Consent- oder Kunden-Opt-out-Umschreibung.

**26 tatsächliche Nachrichten, 26 eindeutige externe Gmail-IDs, 27 logische Quellen.** Michael Nagys zwei ausdrücklich autorisierte Buchungsquellen tragen dieselbe einzige Provider-ID 1a14faca7b33aa3a. Dies sind zwei Verknüpfungen/Sendsperren gegen dieselbe Nachricht, KEINE zwei Sends. Nachrichtenzahlen werden nach DISTINCT provider_message_id gezählt, nicht nach Zeilenzahl.

## Nachlesen der tatsächlichen Speicherung

Live-Nachlesen nach Registrierung bestätigt:
- 27 externe Quellenzeilen / 26 eindeutige Gmail-Nachrichten, alle sent und gmail.
- Alle normalen logischen Schlüssel korrekt, Quellen vorhanden und Empfänger exakt mit Onlineprofil/manueller Reservierung übereinstimmend.
- Alle externen Payloads NULL; attempts=0, first_attempt_at/lease_token/lease_until/next_attempt_at NULL, ambiguous=false.
- Alle 27 Quelle/Empfänger/Gmail-ID/Zeit-Kombinationen einzeln nachgelesen und mit der belegten Liste abgeglichen.
- Gesamtbestand Review: 28 sent-Zeilen / 27 eindeutige Gmail-Nachrichten einschließlich Fatih; 0 offene Review-Zeilen.
- mail_provider_attempts weiterhin 13 (Baseline 13), keine externen Sendebelege als interne Provider-Attempts fingiert.
- customer_mail_settings unverändert: review_requests_from=NULL; invoice_outbox_from=2026-10-18T14:50:22.595108+00:00; updated_at identisch zur Baseline.
- Rainers einzige Review-Sperre unverändert, angelegt 2026-10-18T15:31:20.219937+00:00, Betreiberanweisung; Fatihs bestehender Nachweis unverändert.

Bestehender claim_customer_mail gibt für sent unmittelbar sent zurück; normale Enqueue-/Missing-Quellensuche erkennt bestehende logische Einträge. Damit sind die 27 bekannten Buchungsquellen gegen zweite reguläre Review-Mails abgesichert. **Bestehende Grenze:** kein globaler Personenschlüssel; eine spätere neue Buchung derselben Person wird nicht allein durch diese historischen Quelleneinträge dedupliziert. Keine neue Versandarchitektur eingerichtet; externe unabhängige Sender müssen die Berichte/Sperren selbst beachten. Anzeigen, die rohe Outbox-Zeilen zählen, können Michaels zwei Verknüpfungen nicht automatisch als eine Nachricht zusammenfassen.

## Ausschlüsse und unveränderte Grenzen

Rainer weiterhin ausgeschlossen; Fatih nicht erneut. Beide Tatjana-Konten weiterhin nicht angeschrieben, ungeklärte Personendublette. Fünf fehlende Adressen: Simon Leifels, Tobias Unkler, Ali Kocaaslan, Suzan Ay, Sandra Wünsche; nicht geraten. Daniel nur mit seiner nachgewiesenen Adresse, Ehefrau nicht separat. Tanja als stornierter Kundenkontakt tatsächlich extern berücksichtigt, keine absolvierte Miete behauptet; regulärer Stornoschutz unverändert.

Lovable-Sends in diesem Auftrag: **0**. Keine Jobs gestartet, keine Rechnungen/Zahlungen/Buchungsänderungen, keine Veröffentlichung. Keine Gates/Consents/Opt-outs geändert. Keine neuen Tests oder App-Codeänderungen; konkrete Live-Datennachlese statt unnötiger Tests. Historische 0-Sends-Angaben in audit.md und review-owner-request-2026-10-18.md wurden als Vorbereitungsstand gekennzeichnet und mit dem externen Status ergänzt. recipients.csv und alle Entwürfe bleiben historische Quellen unverändert.

## Konkrete externe Belege

| Name | Empfänger | Gmail-ID | Versandzeit UTC | Quellen |
|---|---|---|---|---|
| Giuseppe Anello | giuseppe.anello@hotmail.de | `1a14fabbd4f3aa81` | 2026-10-18T15:40:17.000Z | booking: `a49632fb-3952-4938-a2ee-28d0205ba253` |
| Alexander Ays | alexanderays@googlemail.com | `1a14fac27c80a6f3` | 2026-10-18T15:40:44.000Z | booking: `b071e0a5-e963-419b-ac52-71137e409b17` |
| Gabriele Brackmann | g.m.brackmann@googlemail.com | `1a14fac2fec3f984` | 2026-10-18T15:40:46.000Z | booking: `033d9abd-1b60-4736-9a34-4d6576d3ea1c` |
| Dennis Brezing | info@fahrzeug-veredelung.com | `1a14fac348debc8f` | 2026-10-18T15:40:48.000Z | booking: `8d9db79e-7c08-4243-8607-aee9ef2d2209` |
| Jochen Gast | gast.jochen@web.de | `1a14fac3d0ca9ccb` | 2026-10-18T15:40:50.000Z | booking: `d7d37bfa-393f-462c-bc26-f64ddfc7e142` |
| Sascha Geier | saschageier19@web.de | `1a14fac423f93de9` | 2026-10-18T15:40:52.000Z | booking: `ed553e8c-fbcc-47f0-90a2-f6cef7735af1` |
| Teodor Georgiev | t.georgiev88@googlemail.com | `1a14fac4dd56cb93` | 2026-10-18T15:40:54.000Z | booking: `f527ec9f-f8f8-4396-81ee-c9acb8f03fa8` |
| Sabrina Hofmann | sabrina-nadine@gmx.de | `1a14fac53fc86f27` | 2026-10-18T15:40:55.000Z | booking: `cb5644d6-9bb0-40cb-ba61-707974e66f61` |
| Celine Kerzinger | ckerzinger@web.de | `1a14fac5a190d76a` | 2026-10-18T15:40:57.000Z | booking: `96209254-e9f1-4bea-a21d-e747b7f9770d` |
| Oleksandr Krupka | r.type.zx@gmail.com | `1a14fac60c3a7668` | 2026-10-18T15:40:59.000Z | booking: `6dc6434d-6188-4608-9888-4addd55b3a32` |
| Franziska Kunert | franzi.zp@web.de | `1a14fac9aed7828d` | 2026-10-18T15:41:14.000Z | booking: `a70572c3-f2a6-46cc-9fab-ece3e9f03d9c` |
| Serissa Matejla | serissa.matejka@web.de | `1a14faca17dab7fb` | 2026-10-18T15:41:16.000Z | booking: `5ce9b09f-418c-4ead-a3da-8b4b00edfac0` |
| Michael Nagy | mi-nagy@t-online.de | `1a14faca7b33aa3a` | 2026-10-18T15:41:17.000Z | booking: `8ef51cb0-6853-4c51-b5a7-eb54a5408375` / `e28cebad-8bd3-4745-84f0-4b5fa17c73c0` |
| Christian Popiolek | christian.popi@freenet.de | `1a14facaf4d6e0ce` | 2026-10-18T15:41:19.000Z | booking: `08080872-e2cc-4f64-838b-d3f2711fe5ad` |
| Raik Schnabel | raik.schnabel@gmail.com | `1a14facb4b1efdbb` | 2026-10-18T15:41:20.000Z | booking: `b82259a2-f2ac-4769-9a3b-90c18873d280` |
| Claudia Seuffert | seuffertc@icloud.com | `1a14facbde08bb05` | 2026-10-18T15:41:22.000Z | booking: `71296565-0ecb-4b8f-a352-d6940ff73f50` |
| Sabri Trad | sabritrad0@gmail.com | `1a14facc2e2861f7` | 2026-10-18T15:41:24.000Z | booking: `4f8ac252-e098-4f6f-b36d-1019d4373c12` |
| Roland Zell | rzell@gmx.de | `1a14facc9aa82f37` | 2026-10-18T15:41:25.000Z | booking: `e8d7e5b5-0251-4f5d-9f64-3d2b0bedac83` |
| Marcel Zipperle | marcel.zipperle@live.de | `1a14facce05216a9` | 2026-10-18T15:41:27.000Z | booking: `9145b6dc-251d-4e28-99d3-173167f9c3ed` |
| Daniel Konrad | daniel.o.konrad@gmail.com | `1a14facd5268c0a8` | 2026-10-18T15:41:29.000Z | manual: `bb8776b4-38ff-4a0e-9c47-6f140e1762bb` |
| Hassan Houdrouj | hassan.houdrouj@web.de | `1a14fad0241ff38d` | 2026-10-18T15:41:41.000Z | manual: `7aaa97ea-f504-40eb-b8d7-7fb1ba749ce1` |
| Andreas Herdt | a.herdt@yandex.ru | `1a14fad0b2a68261` | 2026-10-18T15:41:43.000Z | manual: `11479d46-cd0d-4057-b14c-4853dcb9e41f` |
| Martin Weigand | michaelw50@t-online.de | `1a14fad12451cafb` | 2026-10-18T15:41:44.000Z | manual: `10b4fa9e-bb58-43f2-b900-1f403d394ee8` |
| Sadaf Seddiqi | seddiqisadaf4@gmail.com | `1a14fad19c119a17` | 2026-10-18T15:41:46.000Z | manual: `0355b0d1-5c5a-4ffd-b21e-618711935859` |
| Ali Elkassem | ali.elkassem@ce-montage.com | `1a14fad1f9a3bbe2` | 2026-10-18T15:41:48.000Z | manual: `65774a2c-8e19-40f1-9eec-d4e61945bb19` |
| Tanja Zurawski | t.zara@gmx.de | `1a14fad2581cdeea` | 2026-10-18T15:41:49.000Z | booking: `33e5058a-a148-4de4-ba95-7717e1dbdfdd` |
