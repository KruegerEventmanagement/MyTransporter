# AdSense – Aktivierungsnotizen (Stand: Verifizierung erledigt, Anzeigen AUS)

Der Code ist vorbereitet und vollständig fail-closed: solange die Konfiguration
unvollständig ist, wird kein Google-Script geladen und keine Anfrage gesendet.
AdSense ist **nicht aktiv** (keine Anzeigen, kein Script, keine CMP).

## Aktueller Stand (Verifizierungsstufe)

- Publisher-ID: `ca-pub-6974851907377988` — in `src/lib/adsense.ts` eingetragen
  (`ADSENSE_CONFIG.publisherId`). `enabled=false`, `siteApproved=false`,
  `certifiedCmpConfigured=false`, `slots` leer – es werden KEINE Anzeigen
  geladen und KEINE Google-Anfrage gesendet.
- Website-Verifizierung: `<meta name="google-adsense-account"
  content="ca-pub-6974851907377988">` in `src/routes/__root.tsx` ergänzt
  (neben der bestehenden Search-Console-Verifizierung, nicht ersetzt).
- `public/ads.txt`: echte Zeile
  `google.com, pub-6974851907377988, DIRECT, f08c47fec0942fa0` angelegt.
- Google-Review: **ausstehend** – Site noch nicht durch Google freigegeben.
  Solange `siteApproved=false` bleibt, ist die Konfiguration absichtlich
  nicht einsatzbereit (`isAdSenseConfigured` = false).

## Offene Schritte (in dieser Reihenfolge)

1. Google-Review abwarten, danach `siteApproved: true`.
2. Echte Slot-IDs im AdSense-Konto erzeugen und in `ADSENSE_CONFIG.slots`
   eintragen (`railLeft`, `railRight`, `inlineContent`).
3. Zertifizierte Google-CMP samt Consent-Message einbinden (TCF v2 `__tcfapi`),
   danach `certifiedCmpConfigured: true`. Ohne CMP-Antwort bleibt alles aus.
   Die bestehende Marketing-Einwilligung des Cookie-Banners (Google Ads /
   Meta Conversion-Tracking) gilt ausdrücklich **nicht** als AdSense-/TCF-Consent.
4. Erst danach `enabled: true` setzen. Auto Ads bleiben aus (`autoAds: false`).

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
