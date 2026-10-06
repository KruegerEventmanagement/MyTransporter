# AdSense-Readiness (intern, Stand 06.10.2026)

Nur vom Inhaber im Konto beobachtete Fakten; keine Freigabe, keine behördliche/DSGVO-Bestätigung.

- Website mytransporter.org: seit 04.10.2026 05:41 CEST „Maßnahme erforderlich – Minderwertige Inhalte“ (abgelehnt).
- ads.txt: „Autorisiert“.
- Publisher: ca-pub-6974851907377988
- Slots: railLeft 4238348588, railRight 6950298526, mobileTop 7518309544 („MyTransporter - Mobil oberhalb Logo“, responsive, data-ad-format=auto, full-width-responsive).
- Google-CMP: „Unbenannte Mitteilung gemäß EU-Verordnungen“, Deutsch +1, Stand 22.09.2026, Status Veröffentlicht, angezeigte Mitteilungen 0 / Einwilligungsrate 0 → Live-Einbindung NICHT bestätigt.
- Schalter in src/lib/adsense.ts: enabled, siteApproved, certifiedCmpConfigured, liveCmpVerified = false; autoAds = false.

## Schritte bis zur Aktivierung
1. Qualitätsverbesserungen veröffentlichen (Mietratgeber, Startseiten-Erklärung, /werbeflaeche noindex).
2. Im AdSense-Konto erneute Prüfung beantragen; Entscheidung liegt bei Google.
3. Nach Freigabe: Google-CMP auf der Live-Seite einbinden und prüfen, dass Mitteilungen > 0 angezeigt werden und Ablehnen/Widerruf funktioniert.
4. Erst dann mit Nachweis siteApproved, certifiedCmpConfigured, liveCmpVerified und enabled setzen.
5. Auto Ads/Vignetten erst nach gesonderter Prüfung; Buchung/Login/Profil/Checkout ausnehmen.
