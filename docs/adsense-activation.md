# AdSense – Aktivierungsnotizen (Stand: Inhaberschaft bestätigt, Review angefragt, Anzeigen AUS)

Der Code ist vorbereitet und vollständig fail-closed: solange die Konfiguration
unvollständig ist, wird kein Google-Script geladen und keine Anfrage gesendet.
AdSense ist **nicht aktiv** (keine Anzeigen, kein Script, keine CMP).

## Aktueller Stand

- Publisher-ID: `ca-pub-6974851907377988` — in `src/lib/adsense.ts` eingetragen
  (`ADSENSE_CONFIG.publisherId`). `enabled=false`, `siteApproved=false`,
  `certifiedCmpConfigured=false`, `autoAds=false` – es werden KEINE Anzeigen
  geladen und KEINE Google-Anfrage gesendet.
- Website-Verifizierung: `<meta name="google-adsense-account"
  content="ca-pub-6974851907377988">` in `src/routes/__root.tsx` ergänzt
  (neben der bestehenden Search-Console-Verifizierung, nicht ersetzt).
  **Inhaberschaft von Google bestätigt (verifiziert).**
- `public/ads.txt`: echte Zeile
  `google.com, pub-6974851907377988, DIRECT, f08c47fec0942fa0` angelegt.
- Google-Review: **angefragt**, Site-Status in AdSense „Wird vorbereitet“ –
  also **noch nicht freigegeben**. Zahlungsempfänger ist Christian Krüger als
  Inhaber des Einzelunternehmens MyTransporter; die Zahlungsempfängerdaten
  wurden übermittelt.
- Google EU-Einwilligungsmeldung (CMP-Message) für `mytransporter.org` in
  AdSense **veröffentlicht**: Standard Deutsch + Englisch, drei Optionen
  (Zustimmen / Ablehnen / Verwalten). Das ist reine **Kontoeinrichtung** –
  im Browser ist noch **kein** Adapter implementiert.
- Anzeigeblöcke (echte responsive Display-Einheiten) im Konto erstellt und in
  `ADSENSE_CONFIG.slots` eingetragen:
  - `railLeft` = `4238348588` („MyTransporter – Seitenleiste links“)
  - `railRight` = `6950298526` („MyTransporter – Seitenleiste rechts“)
  - `inlineContent`: nicht vorhanden (kein Block erstellt)
- Anzeigen sind **nicht live**. Die Konfiguration bleibt absichtlich nicht
  einsatzbereit (`isAdSenseConfigured` = false).

## Offene Schritte (in dieser Reihenfolge)

1. Google-Review-Ergebnis abwarten, danach `siteApproved: true`.
2. Echte Google-CMP-/Script-Integration im Browser umsetzen (zertifizierte
   Google-Einwilligungsmeldung, TCF v2.2 `__tcfapi`), Adapter über
   `registerAdConsentAdapter()` registrieren, danach `certifiedCmpConfigured: true`.
   Die bestehende Marketing-Einwilligung des Cookie-Banners (Google Ads /
   Meta Conversion-Tracking) gilt ausdrücklich **nicht** als AdSense-/TCF-Consent.
   **Achtung Deadlock:** laut Google
   (https://support.google.com/adsense/answer/10924669?hl=en) wird die
   Einwilligungsmeldung über das AdSense-Tag selbst ausgeliefert. Das Tag darf
   also nicht erst *nach* vorliegender Einwilligung geladen werden, sonst
   erscheint die Meldung nie. Die Ladereihenfolge muss beim Umsetzen der
   Integration bewusst festgelegt werden (Tag für die Message laden, Anzeigen-
   Requests aber erst nach Einwilligung).
3. Widerrufs-/Einstellungslink („Einwilligung verwalten“) in der Seite ergänzen.
4. Manuell prüfen: Zustimmen, Ablehnen, Widerruf, Timeout sowie tatsächliches
   Rendern bzw. Ausbleiben der Anzeigen.
5. Erst danach `enabled: true` setzen. Auto Ads bleiben aus (`autoAds: false`).

## Routen-Ausschlüsse (keine Anzeigen)

Login/Registrierung, Verifizierung und Dokumenten-Upload, Zahlung, Buchungs-
bestätigung, aktive Fahrt, Profil, Admin, API-Routen und Fehlerseiten.
Auf der Startseite werden Anzeigen während der transaktionalen Buchungsschritte
automatisch unterdrückt (`useSuppressAds` in `BookingSection`, ab Schritt 3
sowie bei Checkout, Bezahlung und laufender Fahrt).

## QA vor Aktivierung

- Deaktivierte/ungültige Konfiguration: keine externe Anfrage, keine leeren Platzhalter.
- Kein CMP-Consent: kein Script, keine Anfrage.
- Responsive: Desktop eigene Außenspalten ohne Überlagerung, Inhaltsbreite unverändert;
  Handy/Tablet ohne Sidebars.
- No-Fill: unbefüllte Flächen klappen zusammen, kein Layout-Sprung.
- Transaktionale Schritte und ausgeschlossene Routen ohne Anzeigen.

## Einwilligung: harte Grenze (Stand aktuell geschlossen)

`src/lib/adsense-consent.ts` liefert **immer `false`**, solange kein echter
CMP-Adapter über `registerAdConsentAdapter()` registriert ist. Es existiert
absichtlich keine (auch keine teilweise) TCF-Implementierung.

Konfigurationsflags allein aktivieren NICHTS. Vor Aktivierung nötig:

- zertifizierte Google-CMP (TCF v2.2) inkl. Consent-Message eingebunden
- Prüfung des Google-Vendors (Google Advertising Products) und aller nötigen
  Zwecke – Purpose 1 allein genügt nicht
- `__tcfapi("addEventListener", 2, ...)` für laufende Consent-Änderungen
- Widerruf: Anzeigen entfernen, `resetAdSenseScriptLoad()` aufrufen
- manueller Test: Zustimmung, Ablehnung, Widerruf, Timeout

## No-Fill

Leere Flächen werden am echten Attribut `data-ad-status="unfilled"` erkannt und
komplett inklusive Kennzeichnung ausgeblendet (kein erfundenes Attribut, keine
globalen CSS-Regeln).
