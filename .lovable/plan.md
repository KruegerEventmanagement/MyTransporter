# Versendete Rechnungen/Angebote nachvollziehbar machen

## Was gestern wirklich passiert ist

Der Versand läuft nicht über dein Postfach bei info@mytransporter.org, sondern über den E-Mail-Dienst, den die App nutzt (mit deinem eigenen Konto dort, nicht über Lovable). Deshalb landet **keine Kopie im Ordner „Gesendet"** deines Postfachs – das ist technisch normal und kein Beweis dafür, dass nichts rausging.

Ob die Mail gestern tatsächlich rausging, lässt sich nachträglich nicht mehr belegen: Die Laufzeitprotokolle reichen nur etwa eine Stunde zurück, und die App speichert bisher keinen Nachweis über verschickte Dokumente. Genau diese Lücke wird jetzt geschlossen – zusätzlich wird der Versand so abgesichert, dass „gesendet" nur noch erscheint, wenn der Dienst den Auftrag wirklich angenommen hat.

## Was geändert wird

1. **Kopie an dich selbst**
   Jede Rechnung/jedes Angebot, das du aus dem Dokumente-Bereich versendest, geht automatisch als Kopie an info@mytransporter.org – mit PDF im Anhang. Damit hast du dauerhaft einen Beleg in deinem Postfach.

2. **Versandprotokoll im Admin**
   Neue Liste unter dem Formular: Datum/Uhrzeit, Dokumentnummer, Empfänger, Betreff, Status (gesendet/fehlgeschlagen) und im Fehlerfall die Klartextursache. So siehst du sofort, ob und wann etwas rausging.

3. **Ehrliche Erfolgsmeldung**
   „Gesendet" erscheint nur noch, wenn der E-Mail-Dienst eine Sende-ID zurückgibt. Sonst gibt es eine deutliche deutsche Fehlermeldung mit dem Grund (z. B. Adresse abgelehnt, Absenderdomain nicht freigegeben) und der Hinweis, dass nichts versendet wurde.

4. **Prüfsendung**
   Nach der Umsetzung schicke ich eine Testrechnung an deine Adresse und zeige dir den Protokolleintrag, damit du siehst, dass Versand und Nachweis funktionieren.

## Technische Details

- Neue Tabelle `public.document_send_log` (kind, number, recipient, subject, status, provider_message_id, error_message, created_by, created_at) mit GRANTs und RLS: nur Admin (`has_role(auth.uid(),'admin')`) darf lesen; Schreiben serverseitig.
- `src/lib/admin-documents.functions.ts`: `sendAdminDocument` setzt zusätzlich `bcc: info@mytransporter.org`, liest die Antwort des Anbieters aus, verlangt eine `id`, protokolliert Erfolg und Fehler in `document_send_log` und gibt `{ ok, messageId }` zurück. Fehlermeldungen werden in deutschen Klartext übersetzt; keine Secrets im Log.
- Neue Server-Funktion `listDocumentSends` (Admin-geprüft, letzte 50 Einträge) für die Anzeige.
- `src/components/admin/DocumentBuilder.tsx`: Erfolgs-Toast nur bei `ok`, Protokolltabelle unter den Buttons, Aktualisierung nach jedem Versand.
- Unberührt: Rechnungslayout/PDF-Erzeugung, Buchungs-/Stripe-Logik, Buchungsmails und Action-State-Machine, Preise, Verfügbarkeit.
- Abschluss: Typecheck, Tests, Produktionsbuild sowie Smoke-Test des Versands.
