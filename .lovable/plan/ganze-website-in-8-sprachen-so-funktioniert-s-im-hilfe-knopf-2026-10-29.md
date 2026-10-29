# Ganze Website in 8 Sprachen + „So funktioniert's" im Hilfe-Knopf

## Was du bekommst
- **Sprachauswahl oben in der Leiste**, direkt neben „Login" und „Registrieren": ein kleiner Knopf mit Weltkugel und Kürzel (z. B. „DE"). Antippen öffnet die Liste:
  Deutsch, English, Русский, العربية (Arabisch), Türkçe, Italiano, Ελληνικά (Griechisch).
  Das sind 7 Sprachen. Die Wahl wird gemerkt, auch in der App.
- **Arabisch** wird von rechts nach links angezeigt, wie Araber es gewohnt sind.
- **Hilfe-Knopf (schwarzer Kreis mit Fragezeichen):** Unter „Mietratgeber" kommt ein neuer Eintrag „So funktioniert's".
- Die Seite „So funktioniert's" nutzt dann dieselbe Sprachauswahl oben. Die eigene DE/EN/RU-Leiste auf der Seite fällt weg.

## Was übersetzt wird (Schritt für Schritt)
1. **Zuerst alles, was Kunden beim Buchen sehen:** Menü, Startseite, Buchungsablauf (Datum, Uhrzeit, Tarif, Fahrzeug, Verifizierung, Registrierung/Login, Bezahlung), Hinweise und Fehlermeldungen, Hilfe-Knopf, Fußzeile, „So funktioniert's".
2. **Danach:** Kundenprofil, Fahrtseite mit Vorher-/Nachher-Fotos und Rückgabe, Preise, FAQ, Kontakt, Langzeitmiete, Umzug, Mietratgeber, Über uns.
3. **Bleibt auf Deutsch:** AGB, Datenschutz und Impressum. Sie gelten rechtlich nur auf Deutsch. Oben steht dann in der gewählten Sprache: „Rechtlich verbindlich ist die deutsche Fassung."
4. **Bleibt vorerst auf Deutsch:** E-Mails, Rechnungen, Schlüsselcode-Mail und dein Adminbereich. Die Mails können wir später auf die Sprache des Kunden umstellen. Dafür muss das System die gewählte Sprache bei der Buchung speichern. Das wäre ein eigener Schritt.

## Wichtig zu wissen
- Englisch, Russisch, Arabisch, Türkisch, Italienisch und Griechisch übersetze ich selbst. Lass sie am besten von Muttersprachlern gegenlesen. Vor allem Preise, Kaution und die 30-€-Regel müssen stimmen.
- Google findet weiterhin die deutsche Seite. Fremdsprachige Google-Treffer wären später ein eigener Schritt.
- An Preisen, Buchungen, Zahlungen und Mails ändert sich nichts. Nur die Anzeige wird übersetzt.
- Nichts wird veröffentlicht, bis du es sagst.

## Technische Details
- Leichtes eigenes i18n ohne neue Bibliothek: `src/lib/i18n/` mit `de.ts` als Quelle (typisierter Schlüsselbaum) und `en/ru/ar/tr/it/el.ts` als `satisfies`-geprüfte Übersetzungen. Ein Test stellt sicher, dass keine Schlüssel fehlen. Ein `LanguageProvider` im `__root.tsx` stellt `useT()` bereit.
- SSR rendert immer Deutsch. Die gespeicherte Sprache aus localStorage und `?lang=` wird erst nach der Hydration übernommen, damit keine Hydration-Fehler entstehen. Danach werden `<html lang>` und `dir="rtl"` für Arabisch gesetzt.
- RTL: Tailwind-Logik auf `ms-/me-/ps-/pe-` umstellen, wo es nötig ist. Richtungspfeile werden gespiegelt.
- Zahlen, Daten und Preise laufen weiter über die bestehenden de-DE-Formatter in der Geschäftslogik. Formatiert wird je Sprache nur in der Anzeige, über `Intl` mit der Locale. Die Berechnungen bleiben unberührt.
- `LanguageSwitcher` sitzt in `Navbar.tsx` neben Login/Registrieren und zusätzlich im Handymenü. In `HelpBubble.tsx` kommt der Link `/so-funktionierts` dazu. `how-it-works-i18n.ts` geht im zentralen Wörterbuch auf.
- Die Umsetzung läuft in den Phasen oben, jede mit Build und Test. Die Server-Validierung bleibt unverändert. Fehlermeldungen vom Server werden über bekannte Codes übersetzt, unbekannte bleiben deutsch.
