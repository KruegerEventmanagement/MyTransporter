## Ziel
Auf jeder Seite unten rechts einen kleinen, schwarzen Hilfe-Kreis einblenden. Klick öffnet eine kleine Sprechblase mit Kontaktdaten.

## Umsetzung

### Neue Komponente `src/components/HelpBubble.tsx`
- Fixed unten rechts (`fixed bottom-4 right-4 z-50`, safe-area-inset für iOS).
- Runder schwarzer Button (48×48 px), weißes `HelpCircle`-Icon aus `lucide-react`.
- Klick togglet ein Popover darüber – weiße Karte, abgerundete Ecken, Schatten, `border-border`.
- Inhalt:
  - Überschrift „Benötigen Sie Hilfe?"
  - Kurzer Text „Ich helfe Ihnen gerne persönlich weiter."
  - Name: **Christian Krüger**
  - Telefon als `tel:`-Link: **015236230118**
  - E-Mail als `mailto:`-Link: **info@mytransporter.org**
  - Schließen-Button (X) oben rechts.
- Schließt bei Klick außerhalb und bei ESC.
- Design passend zum Monochrom-Stil (schwarz/weiß/grau, Fredoka).

### Einbindung in `src/routes/__root.tsx`
- `<HelpBubble />` direkt vor `<Outlet />` (bzw. am Ende des Layouts) rendern, damit sie auf allen Seiten sichtbar ist.

## Nicht Teil der Änderung
- Keine Änderung am bestehenden Registrierungs- oder Buchungsflow.
- Keine neue Backend-Logik.
- Erscheint auch im Admin-/Trip-View (gewünscht, damit überall Hilfe erreichbar ist).
