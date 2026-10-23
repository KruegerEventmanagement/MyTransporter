# Admin-Benachrichtigung: Pop-up statt gesperrtem Bildschirm

## Befund aus der Aufnahme
Im Admin-Bereich liegt ein dunkler Schleier über der ganzen Seite, aber das eigentliche Fenster mit Text und Knöpfen ist nicht zu sehen. Dadurch kann man nichts antippen, nichts schließen und keine Buchung öffnen. Der Schleier gehört sehr wahrscheinlich zum großen Benachrichtigungs-Fenster für neue Buchungen/Hinweise (dunkler Hintergrund über allem). Warum der Inhalt unsichtbar bleibt (Einblend-Animation bleibt hängen oder das Fenster ist größer als der Handybildschirm), wird im ersten Schritt im Handy-Format nachgestellt und bestätigt.

## Was geändert wird
1. Ursache im Handy-Format (390 px, Android-Chrome) mit einer echten Benachrichtigung nachstellen und per Bildschirmfoto bestätigen.
2. Das Benachrichtigungs-Fenster wird ein normales Pop-up:
   - Fenster ist immer sichtbar (keine Einblend-Animation, von der die Sichtbarkeit abhängt), passt auf kleine Bildschirme und ist bei langem Text scrollbar.
   - Schließen jederzeit möglich: X-Knopf oben rechts, Tippen auf den dunklen Hintergrund, Zurück-Taste am Handy.
   - Dunkler Hintergrund heller, damit man sieht, dass dahinter die App ist.
   - Knöpfe bleiben: „Bestätigen“, „Buchung öffnen“, bei Kaution „Kaution prüfen“ / „Später“.
3. Sicherheitsnetz: Falls doch einmal kein Fenster-Inhalt angezeigt wird, verschwindet der Schleier automatisch, statt die App zu sperren.
4. Signalton stoppt beim Schließen wie bisher.

## Was gleich bleibt
Wann Benachrichtigungen kommen, Push aufs Handy, Kaution-Erinnerungen, Gelesen-Status und alle Buchungs-/Zahlungsabläufe bleiben unverändert.

## Prüfung
- Handy-Format: Benachrichtigung erscheint als Pop-up, X / Hintergrund / Zurück schließen es, danach sind Kunden und Buchungen wieder antippbar.
- Bestehende Tests + Typecheck/Build. Nichts veröffentlicht.

## Technische Details
- `src/routes/admin.tsx` Zeilen ~813–890: eigenes `fixed inset-0 z-[100] bg-black/85` Overlay mit `animate-in zoom-in-95` ersetzen durch shadcn `Dialog` (`open={!!alertNotification}`, `onOpenChange` -> schließen; bei `deposit_reminder` wie „Später“ behandeln), `DialogContent` mit `max-h-[90dvh] overflow-y-auto`.
- Zurück-Taste: beim Öffnen History-Eintrag, `popstate` schließt.
