## Ziel
Eine echte Probe-Rechnung im aktuellen Design an `krueger.christian96@gmx.de` senden, damit du das Layout im Postfach prüfen kannst.

## Vorgehen
1. Einen einmaligen Server-Endpoint `/api/public/send-test-invoice` anlegen, der nur mit einem geheimen Token aus dem Request erreichbar ist.
2. Der Endpoint baut eine realistische Beispiel-Buchung im Speicher zusammen (Plan „24h", Sicher-Transport-Paket, Kaution, 19% MwSt., Fahrgestellnummer-Platzhalter) – **ohne** eine echte Buchung in der Datenbank anzulegen.
3. Er ruft die bestehende Rechnungs-Generierung (`invoice-pdf.server.ts`) auf, damit exakt das aktuelle Design (Logo oben links, USt-IdNr. DE328715703, Kautions-Hinweis, ohne § 10 UStG) erzeugt wird.
4. Das PDF wird über Resend an `krueger.christian96@gmx.de` verschickt, Betreff z. B. „Probe-Rechnung MyTransporter – Designvorschau".
5. Nach erfolgreichem Versand einmal per `curl` aus dem Sandbox aufrufen. Endpoint bleibt für spätere Design-Checks bestehen (Token-geschützt).

## Was du bekommst
Eine E-Mail mit angehängter PDF-Rechnung im aktuellen Design an deine GMX-Adresse. Bitte auch im Spam-Ordner nachsehen, da GMX Resend-Mails teils dorthin sortiert.
