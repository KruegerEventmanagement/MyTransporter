# AdSense – Aktivierungsnotizen (Stand: noch NICHT aktiv)

Der Code ist vorbereitet, aber vollständig fail-closed: solange die Konfiguration
unvollständig ist, wird kein Google-Script geladen und keine Anfrage gesendet.
Es sind keine echten IDs im Projekt und AdSense ist **nicht aktiv**.

## Offene Schritte (in dieser Reihenfolge)

1. Echte Publisher-ID (`ca-pub-…`, 16 Ziffern) und echte Slot-IDs im AdSense-Konto erzeugen
   und in `src/lib/adsense.ts` (`ADSENSE_CONFIG.publisherId`, `slots`) eintragen.
2. Google-Site-Verification einrichten – bevorzugt als Meta-Tag ohne Tracking
   im Head der Root-Route (`src/routes/__root.tsx`).
3. `ads.txt` erst anlegen, wenn die echte Publisher-ID bestätigt ist
   (`public/ads.txt`, Zeile: `google.com, pub-<ID>, DIRECT, f08c47fec0942fa0`).
   Keine erfundenen Einträge.
4. Website-Freigabe durch Google abwarten, danach `siteApproved: true`.
5. Zertifizierte Google-CMP samt Consent-Message einbinden (TCF v2 `__tcfapi`),
   danach `certifiedCmpConfigured: true`. Ohne CMP-Antwort bleibt alles aus.
   Die bestehende Marketing-Einwilligung des Cookie-Banners (Google Ads /
   Meta Conversion-Tracking) gilt ausdrücklich **nicht** als AdSense-/TCF-Consent.
6. Erst danach `enabled: true` setzen. Auto Ads bleiben aus (`autoAds: false`).

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
