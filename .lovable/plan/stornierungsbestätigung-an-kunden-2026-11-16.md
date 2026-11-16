# Stornierungsbestätigung an Kunden

## Was du bekommst
Sobald eine Buchung storniert wird, bekommt der Kunde automatisch genau eine freundliche Bestätigung per E-Mail, von info@mytransporter.org mit Logo, wie die anderen Mails.

Gilt für:
- Online-Buchungen, die du in der Kautionsverwaltung stornierst (mit oder ohne Erstattung)
- Manuelle Termine, die du als Admin löschst bzw. stornierst (nur wenn eine E-Mail hinterlegt ist)

## Text der Mail (Entwurf)
Betreff: Ihre Stornierung ist bestätigt · MyTransporter

> Hallo {Vorname},
>
> vielen Dank für Ihre Nachricht. Hiermit bestätigen wir Ihnen gern, dass Ihre Buchung {Buchungsnummer} für den {Fahrzeug} vom {Beginn} bis {Ende} storniert wurde. Sie müssen nichts weiter tun.
>
> {Falls Erstattung: Ihre Erstattung über {Betrag} haben wir veranlasst. Je nach Bank kann es einige Werktage dauern, bis der Betrag auf Ihrem Konto sichtbar ist.}
>
> Wir bedauern sehr, dass es diesmal nicht geklappt hat, und würden uns sehr freuen, Sie künftig wieder bei uns begrüßen zu dürfen. Wenn Sie Fragen haben, antworten Sie einfach auf diese E-Mail, wir helfen Ihnen jederzeit gern weiter.
>
> Herzliche Grüße
> Christian Krüger und das MyTransporter-Team

Ohne Gedankenstriche, ohne Werbung, ohne Abmeldelink-Pflicht (reine Bestätigung).

## Sicherheit
- Pro Buchung höchstens eine Stornobestätigung, auch bei Wiederholungen
- Wird über die bestehende Mail-Warteschlange verschickt (Fehler werden erneut versucht, nie doppelt)
- Keine Mail bei abgelaufenen, nie bezahlten Buchungen
- Alte Stornos werden nicht nachträglich angeschrieben

## Elena Schirle
Ihre Buchungen sind bereits storniert. Nach dem Einbau schicke ich ihr einmalig die Bestätigung über denselben Weg, sonst niemandem rückwirkend.

## Technische Details
- Neue Outbox-Art `cancellation_confirmation` in `customer-mail-outbox.ts` (Typ, Payload einfrieren) und DB-Check per Migration erweitern
- Enqueue in `deposit-settlement.server.ts` nach `status: "cancelled"` und im manuellen Lösch-/Storno-Pfad (manual-notifications Snapshot), Unique `(source_type, source_id, kind)`
- Template im Stil der Buchungsbestätigung, Logo-Asset
- Tests: genau eine Mail pro Storno, Retry ohne Duplikat, keine Mail für expired/pending, Text enthält keine Gedankenstriche
