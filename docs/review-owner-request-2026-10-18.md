# Betreiberauftrag zum einmaligen Bewertungsversand

## Quelle und Zeitpunkt

Dokumentiert am 18.10.2026, nach Betreiberauftrag um 15:24 UTC.

Der Betreiber bestätigt: „Ich habe von allen die Zustimmung mit der Bewertungsanfrage.“ Die Zustimmung wurde nach seiner Aussage außerhalb der Website eingeholt. Diese Dokumentation bestätigt ausschließlich die heutige Erklärung des Betreibers, nicht eine direkt beobachtete Kundenerklärung oder einen früheren Online-Checkout. Bestehende Einwilligungsdatensätze wurden nicht überschrieben oder rückdatiert.

## Dauerhafter Betreiber-Ausschluss

Rainer/Reiner Schmutnig, E-Mail `rainerrene11@web.de`, darf keine Bewertungsmail erhalten. Die Bezeichnung „Rainer Schmuttnick“ im Auftrag meint laut Betreiber denselben Kunden. Frühere manuelle Buchung: `6ea99f1a-0f5c-4fd4-8aa7-0a043a1902ec`. Vom Betreiber benannte Gmail-Belege: `1a0ceefb9e894833`, `1a0d008a34fc8725`, `1a0d44923b2fa002`; diese Identitätsbelege wurden in dieser Prüfung nicht erneut geöffnet.

Dies ist eine Betreiberanweisung, keine Kundenabmeldung. Der Ausschluss ist in der dauerhaften Projektanweisung festgehalten, aber es wurde kein neuer technischer Sperrdatensatz angelegt. Der globale Bewertungsversand bleibt deaktiviert. Vor einer späteren Aktivierung muss der Ausschluss zusätzlich im jeweiligen Versandsystem wirksam hinterlegt werden.

## Lesender Bestandsbefund

- Fatih: bereits gesendet, reguläre Outbox bestätigt Gmail-ID `1a14f90f70148f6b`; keine Wiederholung.
- Bestehende gespeicherte Consents: Fatih und Jochen aus Online-Checkout, Ali Elkassem aus manueller Administration. Unverändert.
- `email_opt_outs` war beim Lesen leer. Keine Abmeldungen angelegt oder entfernt.
- `account_deletions` war beim Lesen leer. Dies allein beweist nicht die Aktivität sämtlicher Konten; diese wurde nicht abschließend für jeden Empfänger geprüft.
- `review_requests_from` bleibt NULL; keine Zukunftssendungen angelegt.
- Fünf vorhandene manuelle Kundenreservierungen mit E-Mail: Sadaf Seddiqi (`seddiqisadaf4@gmail.com`), Martin Weigand (`michaelw50@t-online.de`), Andreas Herdt (`a.herdt@yandex.ru`), Hassan Houdrouj (`hassan.houdrouj@web.de`), Ali Elkassem (`ali.elkassem@ce-montage.com`). Alte `confirmation_requested=false` wurden nicht als Nichtkundenbeweis interpretiert.
- Manuelle Reservierungen ohne E-Mail: Sandra Wünsche; Daniel, Konrad; Suzan Ay; Tobias Unkler; Ali Kocaaslan; Simon Leifels. Keine Adressen erraten.
- Tanja Zurawski: gelesene Onlinebuchung storniert; ohne andere echte Buchung kein Versand.
- Christian-Krüger-Buchungen wurden als vom Betreiber benannte interne Daten behandelt, nicht als Kundenempfänger.
- Tatjana Krüger (`tatikrug100963@gmail.com`) und Tatjana Krüger (`sonnenburg.thomas@gmx.de`): bezahlte Buchungen vorhanden; Gmail-Suche findet vier Korrespondenzen, Inhalt nicht nachgelesen. Identitäten bleiben ungeklärt, nicht allein aufgrund des Namens als Tests klassifiziert.
- Die breite Gmail-Suche nach Bewertung/Erfahrung findet außer Fatih weitere Nachrichten. Deren Inhalte wurden nicht geprüft; sie belegen keine weiteren Kunden-Bewertungsanfragen und widerlegen auch nicht die vom Betreiber geschilderte Suche. Eine abschließende empfängerbezogene Dublettenprüfung erfolgte nicht.

## Ausführungsergebnis

**Zusätzliche Mails: 0. Neue Gmail-IDs: keine.**

Der verlangte nachträgliche Versand derselben Bewertungsanfrage an den gesamten Kundenbestand ist eine Empfängerlisten-Kampagne. Lovable-App-Mails unterstützen keinen solchen Marketing-Sammelversand, auch nicht nach Betreiberbestätigung von Einwilligungen oder durch Aufteilung in Gmail-Einzelaufrufe. Für den Versand ist ein separater Marketing-Maildienst erforderlich.

Keine neuen Outbox-Zeilen, keine neuen Rechnungen, keine Buchungsänderungen, keine Providerwechsel, keine Änderung bestehender Consents/Opt-outs, keine Veröffentlichung. Der gewünschte Text wurde nicht versendet; HTML/Logo/Abmeldelink wurden nicht als neue Versandvorschau abschließend geprüft.

## Ergänzung Daniel Konrad, Betreiberauftrag 18.10.2026 um 15:26 UTC

- Nur die Kontaktadresse `daniel.o.konrad@gmail.com` wurde zur bestehenden manuellen Reservierung `bb8776b4-38ff-4a0e-9c47-6f140e1762bb` ergänzt. Vorher war `customer_email` NULL, danach ist sie gespeichert. Keine andere Adresse wurde verwendet, insbesondere kein separater Kontakt für die mitkopierte Ehefrau.
- Quelle Gmail `1a0664b8c24641d5`: Daniels eigene Buchungsmail, Absenderadresse und Mobilnummer passen zum Datensatz. Quelle Gmail `1a0667ae04299294`: Christians Antwort an Daniel mit ausdrücklicher Buchungsbestätigung, gleicher Thread und zitierter ursprünglicher Buchungsmail.
- Korrespondenz nennt Freitag 11.09.2026 ab 17 Uhr und Rückgabe am Samstag 12.09.; Reservierung entspricht in Europe/Berlin Freitag 17 Uhr bis Samstag 17 Uhr. Die Mail bestätigt den Rückgabetag, aber keine genaue Rückgabeuhrzeit. Telefonnummer nach Normalisierung identisch. Zeiten und Telefonnummer unverändert.
- Unmittelbare Gmail-Suche `in:sent to:daniel.o.konrad@gmail.com (Bewertung OR Erfahrung OR Bewertungsanfrage)` ergab 0 Treffer. Reguläre Review-Outbox für Adresse bzw. Reservierung hatte 0 Zeilen. Dies ist ein Suchbefund, keine absolute Garantie gegen anders formulierte frühere Nachrichten.
- Reguläre Kontaktkorrektur erhöht die Revision von 1 auf 2 und erhält die bestehenden Änderungs-/Kalendermechanismen. `confirmation_requested` bleibt false; kein Kundenbestätigungsauftrag wurde ausdrücklich angelegt, kein Bewertungsversand und keine Rechnung ausgelöst.
- Nachlesen bestätigt: keine `booking_email_intents` für Daniel. Der bestehende Änderungstrigger erzeugte automatisch die Betreiberbenachrichtigung `a1336e3f-4985-4b29-b05d-0d18e87ddfd7`, Revision 2, Status pending. Diese wurde nicht manuell verarbeitet; ein späterer regulärer Betreiber-/Kalenderabgleich ist möglich und wird nicht als Kundenzustellung ausgegeben.
- Keine Datenmigration oder Programmänderung, keine Veröffentlichung. **Zusätzliche Bewertungs-/Rechnungsmails weiterhin 0; keine neuen Gmail-Sende-IDs.** Der Sammelversand bleibt blockiert durch den erforderlichen separaten Marketing-Maildienst.
- Laut Betreiber wurden für Simon Leifels, Tobias Unkler, Ali Kocaaslan, Suzan Ay und Sandra Wünsche keine Google-Contacts-Kontakte gefunden; seine Gmail-Suche für die letzten beiden läuft noch. Nicht unabhängig geprüft, keine Adressen ergänzt oder erraten.