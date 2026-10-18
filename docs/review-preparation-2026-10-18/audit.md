# Versandfreie Vorbereitung und Korrektur der Versandgrenze

## Aktueller Status: externer Versand gemeldet und abgeschlossen nachregistriert

Ergebnisergänzung laut Betreiber/Root: **26 Gmail-Annahmen/SENT, 1 bekannter dauerhafter Zustellfehler (Claudia Seuffert), 25 ohne bislang bekannte Fehlermeldung; keine Zustellbestätigung für diese 25.** DSN `1a14faccb704cd89`, 18.10.2026 15:41:26 UTC, failed/5.1.1, iCloud `550 5.1.1 user does not exist`, Bezug Original `1a14facbde08bb05`. DSN-Quelle im bestehenden abgeschlossenen Nachweis annotiert; keine automatische Wiederholung, kein Opt-out fingiert, Original-ID erhalten. Details und Grenze des fehlenden adressweiten Bounce-Schutzes in `external-send-audit.md`.

Am 18.10.2026 meldet der Betreiber **26 zusätzliche externe Bewertungsanfragen**, gesendet 15:40:17–15:41:49 UTC über den **unabhängigen nativen ChatGPT-Gmail-Connector**, nicht durch Lovable. Laut Betreiber wurden alle 26 Nachrichten mittels `batch_read_email` aus SENT nachgelesen; die abschließende Betreffsuche fand genau 26 Nachrichten und die Review-Suche an Rainer 0. Dies ist ein übermittelter externer Nachweis, keine in diesem Auftrag erneut ausgeführte Gmail-Prüfung und keine Aussage über Zustellung im Empfängerpostfach.

Exakte Nachweise: `external-sends.json`; lesbarer Abschlussbericht: `external-send-audit.md`. 25 `prepared`-Kontakte plus Tanja `separate_contact` entsprechen exakt `recipients.csv`. **26 tatsächliche Nachrichten / 26 unterschiedliche Gmail-IDs / 27 logische Buchungsquellen**: Michaels zwei Buchungen sind mit derselben einzigen Nachricht verknüpft. Die vorhandene Outbox wurde ausschließlich direkt mit `status='sent'` ergänzt, ohne Payload, Hash, interne Provider-Attempts, Lease oder offenen Auftrag. Historische Vorbereitung und Entwürfe bleiben unverändert nachvollziehbar.

Bestätigte tatsächliche Header laut Betreiber: festes From/Reply-To, Betreff „Danke für deine Buchung! Wie war deine Erfahrung?“, genau ein To, kein CC/BCC. **Kein tatsächlicher List-Unsubscribe-Header**: der native externe Connector unterstützt keine benutzerdefinierten Header. Sichtbare Mailto-Abmeldung und Antwortmöglichkeit vorhanden; keine HTTP-Tokens erfunden. Das frühere Manifest enthält nur vorgeschlagene Entwurfsheader, nicht tatsächlich versendete Header. Textversion laut Betreiber lediglich auf normale Leerzeilen verdichtet.

**Lovable-Sends in diesem Nachweisauftrag: 0.** Keine Jobs gestartet, keine Rechnungen/Zahlungen erzeugt, keine Veröffentlichung oder Änderung der Versandgates/Einwilligungen/Sperren. Rainer/Fatih nicht erneut, beide Tatjana-Prüffälle und fünf fehlende Adressen weiterhin offen.

## Historischer Stand vor dem externen Versand

Stand: 18.10.2026, ab 15:29 UTC, vor 15:40 UTC. Damaliger Nutzerauftrag: KEINE Versandversuche, keine Grenzumgehung. Damals zusätzliche Sends **0**, neue Gmail-Sende-IDs **keine**. Die folgenden Prüfungen dokumentieren diesen historischen Vorbereitungsstand, nicht den heutigen Gesamtversandstatus.

## Tatsächliche Quelle, Scope und beobachteter Status

- Der dokumentierte eingebaute Lovable-App-Maildienst ist für erwartete, einzelne ereignisbezogene Nachrichten gedacht, nicht für Empfängerlisten-Kampagnen. Die Betreiberbestätigung einer Einwilligung macht eine Bestandskampagne nicht zu einer einzelnen Ereignismail. Öffentliche Produktbeschreibung: https://docs.lovable.dev/features/custom-emails . Die detaillierte operative Kampagnenregel ist eine Plattformvorgabe dieses Dienstes, kein in dieser Prüfung zurückgegebener Fehlercode; interne Anweisungen werden nicht wiedergegeben.
- Unabhängiges Google Workspace/Gmail ist separat dokumentiert: https://docs.lovable.dev/integrations/google-workspace . Die verfügbare Connector-Konfiguration bestätigt `gmail.send` und `gmail.readonly`; das Profil liefert HTTP 200 für `info@mytransporter.org`. Daraus folgt gültiger Lesezugriff und gewährter Sendescope, **nicht** die erfolgreiche Annahme dieser Kampagne.
- **Keine beobachtete automatische Gmail-Policy-Ablehnung, kein aktuell offenes Human-Approval für diesen Versand und kein Versandversuch in dieser Prüfung.** Die frühere Aussage, die App-Mail-Grenze verbiete ausdrücklich auch diesen unabhängigen Gmail-Connector, war eine unbelegte Verallgemeinerung und wird korrigiert. Es wird keine neue Freigabestufe behauptet. Ein Marketingdienst ist eine Empfehlung, kein hier belegtes Gmail-Verbot. Auch https://docs.lovable.dev/integrations/resend behandelt andere Mailanbieter getrennt.
- Praktischer aktueller Versandstopp: der ausdrückliche Nutzerauftrag, nur vorzubereiten. Zusätzlich bleibt die vorhandene reguläre Review-Startgrenze `review_requests_from = NULL` unangetastet. Das bestehende Einreihen verlangt seine ursprünglichen quellbezogenen Consent-/Statusregeln; die externe Betreibererklärung wurde nicht als Checkout-Consent hineingeschrieben. Eine geprüfte einmalige, personenübergreifend deduplizierende Eingangsfunktion existiert derzeit nicht. Das ist eine bestehende Implementierungsgrenze, keine Gmail-Ablehnung. Tanja bleibt im normalen Versand durch den Stornostatus geschützt.

## Vollständigkeit und Zahlen

Live gelesen: **32 Onlinebuchungen / 24 Profile**, **11 bestehende manuelle Reservierungen**. Rainer ist eine zusätzlich dokumentierte historische, inzwischen nicht mehr vorhandene manuelle Quelle.

| Entscheidung | Zahl | Bedeutung |
|---|---:|---|
| Regulär vorbereitet | 25 | 19 Onlinekontakte + 6 manuelle, einschließlich Daniel |
| Separater stornierter Kundenkontakt | 1 | Tanja Zurawski, ausschließlich Service-/Buchungserfahrung |
| Tatjana-Identitätsprüffälle | 2 | Keine pauschale Testannahme, mögliche Personendublette noch offen |
| Bereits gesendet | 1 | Fatih, Gmail `1a14f90f70148f6b`, nicht erneut |
| Interner Betreiber | 1 | Christian Krüger, 8 Buchungen, keine Kundenmail |
| Dauerhafte Betreibersperre | 1 | Rainer Schmutnig, technische Sperre gesetzt |
| Fehlende E-Mail | 5 | Keine Adresse geraten |

Die CSV enthält 36 Entscheidungszeilen inklusive Ausschlüssen und fehlenden Adressen. **28 lokale HTML-/Textentwurfspaare** (25 + 1 + 2), nicht 28 freigegebene Sends. 5 reguläre Kontakte haben erst bevorstehende Mietbeginne: Jochen, Franziska, Christian Popiolek, Serissa sowie Ali (18.10.2026 18 Uhr Berlin). Sie bekommen Entwürfe ohne „wieder“; nirgendwo wird eine absolvierte Fahrt behauptet.

## Konten, Opt-outs, Dubletten

- Alle 24 Onlineprofile haben ein bestehendes, nicht gelöschtes Auth-Konto; keine aktuelle Sperre (`banned_until`) und kein Eintrag in `account_deletions`. Die Kontoprüfung wurde über direkte lesende Joins ausgeführt, nachdem `is_account_active` für diesen Lesedienst keine EXECUTE-Berechtigung hatte. Dieser Lesefehler ist **kein Mailversandfehler**. Keine Berechtigung geändert.
- Vor Rainers administrativer Sperre war `email_opt_outs` leer. Nachher exakt eine Review-Sperre: Rainer. Vorhandene Online-Consents von Fatih/Jochen und manueller Consent von Ali unverändert nachgelesen. Die externe Zustimmungsbestätigung ist ausschließlich Betreiberquelle vom 18.10.2026, nicht direkt beobachtete Kundenerklärung.
- Adressen normalisiert/validiert, exakte Empfängerdubletten keine. Michael Nagys zwei Buchungen zu einer Person/einem Entwurf zusammengeführt. Unterschiedliche Namen oder Firmenkontakte werden nicht anhand des Mail-Lokalteils umbenannt (Martin bleibt Martin trotz `michaelw50`). Christian Popiolek ist nicht Christian Krüger. Keine weiteren Online-/manuellen Namens-/E-Mail-Dubletten gefunden. Tatjana bleibt ausdrücklich offene Personendublette.
- Gmail-Suche nur lesend: `in:sent (Bewertung OR Bewertungsanfrage OR "Wie war deine Erfahrung" OR "Deine Erfahrung mit MyTransporter")` ergab genau Fatih. Review-Outbox enthält ebenfalls nur Fatihs erfolgreichen Eintrag, keine offene/unklare weitere Review-Annahme. Empfänger der Gmail-Ergebnismenge gegen die Liste abgeglichen. Daniel wurde im vorigen Schritt zusätzlich empfängerbezogen ohne Treffer geprüft. Kein absoluter Nachweis gegen beliebig anders benannte oder extern gesendete ältere Nachrichten; vor einem späteren Versand erneut prüfen.

## Tatjana: konkrete Beurteilung ohne Testpauschale

1. `tatikrug100963@gmail.com`: eigenes bestätigtes aktives Konto, Buchung `1d7d8dcd-3945-4a56-a1dc-f42dfd1d2991`, 02.07.2026, Status paid, 39 €, gespeicherte PaymentIntent-Referenz. Telefonnummer unterscheidet sich vom Betreiber. Gmail `19f1ee2047b0987c` (Registrierung) und `19f1ee5356ce4d2a` (Buchung) passen. Das sind **automatisch erzeugte Betreiberbenachrichtigungen**, keine persönliche Kundenerklärung. Kein hinreichender Testbeweis; echter Kundenkandidat.
2. `sonnenburg.thomas@gmx.de`: anderes bestätigtes aktives Konto, Buchung `994eb2cb-fdfe-4db1-ab9d-d88842d4ab5c`, 09.07.2026, paid, 39 €, andere PaymentIntent-Referenz. Telefonnummer nach Normalisierung identisch mit Betreiber Christian Krüger. Gmail `19f467c14fc4478f` und `19f467ed7d1dabd3` bestätigen die entsprechenden automatischen Registrierung-/Buchungsdaten, nicht die tatsächliche Person hinter der Adresse.

Für beide alten Buchungen ist `stripe_environment` NULL; daraus weder Test noch Live ableiten. Kein Stripe-Aufruf, keine Zahlung. Derselbe vollständige Name lässt mögliche Personendublette offen; die zweite Telefonnummer ist ein konkretes internes/shared-contact Signal, kein Beweis für Testdaten. Beide getrennt auditiert und entworfen, **nicht als zwei bestätigte unterschiedliche Personen oder als definitive Testkonten klassifiziert**. Identitäts-/Personendublette bleibt mit vorhandenen Belegen nicht endgültig auflösbar.

## Manuelle Kontakte und Tanja

- Daniel: `daniel.o.konrad@gmail.com`, Quelle `bb8776b4-38ff-4a0e-9c47-6f140e1762bb`. Eigene Mail `1a0664b8c24641d5`, Betreiberbestätigung `1a0667ae04299294`; Zeit/Telefonabgleich dokumentiert im früheren Bericht. Adresse im aktuellen Datensatz bestätigt. Ehefrau nicht separat erfasst. Keine erneute Kontaktänderung.
- Weitere 5 manuelle E-Mail-Kunden: Sadaf, Martin, Andreas, Hassan, Ali. Altmodell-Flag `confirmation_requested=false` disqualifiziert die realen Reservierungen nicht. Kein Website-Konto als zusätzliche Bedingung für rein manuelle Kunden erfunden.
- Ohne Adresse: **Sandra Wünsche, Suzan Ay, Tobias Unkler, Ali Kocaaslan, Simon Leifels**. Im Livebestand NULL; laut Betreiber auch Gmail-/Google-Contacts-Suche erfolglos. Keine Adressen erraten oder weitere Suche/Versuche gestartet.
- Tanja: `t.zara@gmx.de`, aktives Konto, stornierte Buchung `33e5058a-a148-4de4-ba95-7717e1dbdfdd`. Nutzer bestätigt echten Kundenkontakt und umfasst sie jetzt ausdrücklich. Separat mit Entwurf nur zur bisherigen Buchungs-/Serviceerfahrung. Eine aktuelle Gmail-Suche `in:sent to:t.zara@gmx.de` fand keinen zusätzlichen Beleg; Kontodaten/Buchungsstatus und Betreiberquelle sind ehrlich getrennt. Normalen Stornoschutz nicht verändert.

## Rainers technische Sperre und Provenienz

Am **18.10.2026 15:31:20.219937 UTC** administrativ `email_opt_outs(email_lower='rainerrene11@web.de', scope='review_request')` eingefügt, Konfliktfall unverändert lassen. Nachlesen bestätigt exakt diesen Eintrag. **Quelle: ausdrückliche Betreiberanweisung vom 18.10.2026, NICHT Kundenklick, NICHT Kundenwiderspruch.** Die Tabelle besitzt keine Provenienzspalte; die Quelle wird durch diesen Auditbericht und das autorisierte Datenänderungsprotokoll erhalten, nicht im Kunden-Abmeldeweg erfunden.

Wirksamkeit: `src/lib/customer-mail-outbox.server.ts` prüft normalisierte Adresse und Review-Scope in `isOptedOut`, sowohl vor Einreihen als auch im Versand-Precheck. Kein Review-Auftrag für Rainer vorhanden; keine Verarbeitung gestartet. Sperre betrifft nur Review, nicht Rechnung/Buchungsinfos. Keine bestehenden Sperren oder Consentdaten überschrieben. Unabhängiges Gmail allein kennt diese Website-Sperre nicht; jede spätere freigegebene Versandimplementation muss sie vor jedem Versuch lesen, sonst ist deren Wirkung außerhalb des regulären Weges nicht gegeben.

## Fertige Entwürfe und Abmeldefunktion

- `recipients.csv`: vollständige Kontakt-/Entscheidungsliste mit Quellen.
- `render-drafts.ts`: rein lokales Erzeugen über bestehendes `renderEmail`; keine DB-/Provider-/Server-/Versandimporte. Ändert keine produktive Vorlage.
- `draft-manifest.json`: personalisierte Betreff-/Absender-/Reply-To-/List-Unsubscribe-Angaben und Dateinamen; `sendEnabled:false` bei jedem Entwurf.
- `drafts/*.html` und `drafts/*.txt`: je 28 vollständige persönliche Entwürfe. Logo `https://www.mytransporter.org/email-logo.png`, identischer Tabellenaufbau/Schrift wie Rechnung, Signatur Christian Krüger / MyTransporter, gewünschter Google-CID-Link, freiwillige ehrliche Rückmeldung ohne Sterne-/Belohnungsvorgabe. Keine Gedankenstriche im Nachrichtentext; fest vorgeschriebener Anzeigename behält seinen Gedankenstrich.
- Kein erfundener HTTP-Abmeldetoken: Der bestehende One-Click-Link braucht einen gespeicherten Outbox-Datensatz. Einen solchen nur für eine Vorschau anzulegen wäre ein neuer Versandauftrag und ist hier ausgeschlossen. Stattdessen haben die fertigen Entwürfe eine **echte Mailto-Abmeldung** an `info@mytransporter.org` mit vorausgefülltem Betreff/Text sowie Antwortmöglichkeit; `List-Unsubscribe` enthält dieselbe Mailto-Adresse. Das ist funktionierender Kontaktwiderspruch, **kein automatisches One-Click-Speichern**. Eine erhaltene Abmeldung muss administrativ in den vorhandenen Review-Sperrmechanismus übernommen werden. Kein fingierter `List-Unsubscribe-Post`-Header. Bestehende produktive HTTP-/One-Click-Abmeldung unverändert. Bei späterer zulässiger Einreihung würde regulär der echte gespeicherte Token genutzt.

## Unveränderte Schutzgrenzen

Keine neue Rechnung oder Zahlung, keine Buchungsänderung, keine Outbox-/Provider-Attempt-Zeile, keine Consent-Umschreibung, keine Sender-/Provider-Umschaltung, keine Job-/Cron-/Gate-Aktivierung, keine Veröffentlichung. Einzige fachliche Liveänderung in diesem Auftrag: Rainers autorisierte administrative Review-Sperre. **0 zusätzliche Sends.**

## Prüfung

28 Entwurfspaare lokal gerendert; eindeutige/valide Adressen, Text ohne Gedankenstriche, Google-Link und Mailto-Abmeldung kontrolliert. Desktop 1280×1800 und mobil 390×844 geprüft, offizielles Logo geladen (1920 px Quelldatei), keine horizontale Überlagerung. 29 vorhandene Outbox-/Kontoschutztests bestanden; zusätzlicher Vorbereitungstest `src/lib/review-preparation.test.ts` deckt konkrete Rainer-/Fatih-/Daniel-/Tanja-/Michael-/fehlende-Adressen-Regeln ab. Automatisches Buildsignal zuletzt `build OK`. Live-Review-Outbox abschließend weiterhin 1 Zeile/1 sent (Fatih), Rainers Sperre nachgelesen. Kein Versand-End-to-End ausgeführt, weil ausdrücklich untersagt.