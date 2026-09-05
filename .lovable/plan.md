# Cookie-Banner: Wortlaut anpassen

## Änderung
Im Cookie-Consent-Banner (`src/components/CookieConsent.tsx`) die beiden Button-Beschriftungen ändern:

- „Marketing erlauben" → **„Cookies zulassen"**
- „Nur notwendige" → **„Cookies nicht zulassen"**

Grund: Der Begriff „Marketing" klingt für Nutzer unpassend; die Buttons sollen neutral „Cookies zulassen / nicht zulassen" heißen.

## Was NICHT geändert wird
- Logik, Consent-Werte (`necessary` / `marketing`) und interne Bezeichnungen bleiben unverändert.
- Die Erläuterungstexte im Banner bleiben, da sie sachlich beschreiben, was die Einwilligung steuert (Conversion-Tracking von Google Ads und Meta).
- Kommentare/Bezeichnungen wie „Marketing-Einwilligung" in `analytics.ts`, `meta-pixel.ts` etc. bleiben als technische Begriffe bestehen.

## Prüfung
Typecheck (`bunx tsgo --noEmit`) danach ausführen.
