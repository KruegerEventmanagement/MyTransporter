## Ziel
Sobald die Startseite geladen wird, erscheint eine große, zentrierte Benachrichtigung über dem geblurten Hintergrund. Sie informiert Besucher, dass aktuell alle Transporter bis zum 07.09. vermietet sind und keine Fahrzeuge verfügbar sind. Optionaler Hinweis auf möglichen Nachschub in 2–3 Wochen.

## Umsetzung

### 1. Neue Komponente `src/components/AvailabilityNotice.tsx`
- Vollbild-Overlay (`fixed inset-0 z-50`) mit `backdrop-blur-xl` und halbtransparenter schwarzer/weißer Hintergrundfarbe.
- Zentrierte Dialog-Box mit max. Breite (`max-w-lg`), großem Titel, kurzem Erklärungstext und einem einzigen Button „Verstanden".
- Nutzt den bestehenden `Dialog` aus `src/components/ui/dialog.tsx` oder ein natives Overlay, falls der shadcn-Dialog zu klein ist.
- Textvorschlag:
  - Titel: „Aktuell keine Transporter verfügbar"
  - Text: „Alle unsere Transporter sind leider bis zum 07.09.2026 vollständig vermietet. Eine Buchung ist daher derzeit nicht möglich. Eventuell wird in 2–3 Wochen wieder Nachschub verfügbar sein."
  - Button schließt das Overlay und speichert die Entscheidung optional im `sessionStorage`, damit ein erneutes Öffnen innerhalb der Sitzung nicht stört.

### 2. Einbinden in `src/routes/index.tsx`
- `<AvailabilityNotice />` direkt im `Index`-Component rendern.
- Initial sichtbar (`open` per `useState(true)`), damit die Meldung sofort erscheint.

### 3. Styling
- Keine harten Farben – ausschließlich semantische Tokens (`bg-background/80`, `text-foreground`, `backdrop-blur-xl`, `border-border`).
- Auf Mobilgeräten weiterhin zentriert mit ausreichend Padding (`px-4`).
- Hintergrund hinter dem Overlay bleibt sichtbar, aber stark geblurrt.

### 4. Barrierefreiheit
- `role="alertdialog"`, `aria-modal="true"`, Fokus-Trap über den bestehenden Dialog.
- Schließen nur über den Button (kein Klick außerhalb), damit die Information nicht versehentlich übersehen wird.

## Dateien
- `src/components/AvailabilityNotice.tsx` (neu)
- `src/routes/index.tsx` (Einbindung)

## Ergebnis
Jeder Besucher sieht sofort beim Öffnen der Website eine deutliche, zentrale Meldung über dem geblurten Hintergrund. Erst nach Klick auf „Verstanden" kann er die Seite normal nutzen.