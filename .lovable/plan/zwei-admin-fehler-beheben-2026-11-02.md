# Zwei Admin-Fehler beheben

## 1. Gelöschtes Kundenkonto bleibt für Admin nachvollziehbar

Befund (geprüft): Das Konto (Kunden-ID 0a4bb414) wurde am 02.11. vom Kunden gelöscht. Die Buchung, die Rechnung (mit Name Roland Zell und E-Mail) und die vier Ausweis-/Führerscheinfotos liegen weiterhin sicher im Archiv (aufbewahrt bis 15.01.2027). Die Adminseite liest aber nur das gelöschte Profil, daher "Unbekannter Kunde".

Änderung:
- Kundenseite im Admin zeigt bei gelöschten Konten Name, E-Mail und Telefon aus den gespeicherten Belegen bzw. einem Kontakt-Snapshot, mit Hinweis "Konto vom Kunden gelöscht am …".
- Archivierte Ausweis-/Führerscheinfotos werden dem Admin weiterhin (kurzzeitig signiert) angezeigt, solange die Aufbewahrungsfrist läuft.
- Ab jetzt wird beim Löschen ein Kontakt-Snapshot (Name, E-Mail, Telefon, Geburtsdatum) nur für Admins gespeichert, damit künftige Fälle vollständig bleiben.
- Für den Kunden bleibt das Konto gelöscht; nichts wird wiederhergestellt.

## 2. Teil-Kautionsrückzahlung (Onur Yüksel) funktioniert wieder

Befund (geprüft): Der Fehler "value.startsWith is not a function" entsteht, weil bei neuen Rückgaben ein Ja/Nein-Wert ("getankt: ja") mitgespeichert wird. Die Prüfung der fehlenden Fotos erwartet dort nur Text und stürzt ab, darum lädt "Offene Kautionen" nicht.

Änderung:
- Prüfung überspringt Nicht-Text-Werte sicher; Seite lädt wieder.
- Ablauf danach unverändert: Grund ankreuzen, Kommentar, Betrag, Abschluss, Stripe-Rückzahlung über den geschützten Weg (keine Doppel-Erstattung), Kundenmail standardmäßig aus.
- Ich löse keine Rückzahlung selbst aus; Sie klicken den Button.

## Prüfung
- Test für Rückgaben mit Ja/Nein-Wert, Tests für Admin-Anzeige gelöschter Konten.
- Browsercheck "Offene Kautionen" und Kundenseite als Admin. Keine Zahlungen, Mails oder Veröffentlichung.

## Technisch
- `classifyDocumentationGaps`/`exceptionKind`: `typeof value !== "string"` ignorieren.
- Admin-Serverfunktion: Fallback auf `issued_documents` (neueste) und `document_archive` (signierte URLs, nicht purged).
- Migration: `deleted_contact_snapshot jsonb` (Admin-RLS) bzw. eigene Tabelle, befüllt in `request_account_deletion` vor Profil-Löschung.
