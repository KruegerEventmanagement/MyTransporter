## Problem

Auf iPhone zeigt das Banner „Als App installieren" nur den Hinweis „Teilen-Symbol → Zum Home-Bildschirm" — es passiert beim Tippen nichts. iOS Safari unterstützt `beforeinstallprompt` nicht, daher kann der Browser keinen automatischen Installationsdialog öffnen. Aktuell hat der iOS-Pfad gar keinen klickbaren Button, nur Text.

Auf Android/Desktop-Chrome funktioniert es zwar, aber wenn `beforeinstallprompt` noch nicht gefeuert hat (z. B. PWA-Kriterien noch nicht erfüllt, oder User hat es schon mal dismissed), passiert ebenfalls nichts.

## Lösung

`src/components/InstallBanner.tsx` so umbauen, dass es auf jedem System eine sinnvolle, klickbare Aktion gibt:

1. **Android/Desktop mit nativem Prompt**: Wie bisher — Button „Installieren" ruft `prompt.prompt()` auf.
2. **iOS (iPhone/iPad Safari)**: Button „Anleitung" öffnet eine visuelle Schritt-für-Schritt-Anleitung als Modal mit:
   - Schritt 1: Teilen-Symbol antippen (mit Icon-Darstellung)
   - Schritt 2: „Zum Home-Bildschirm" wählen
   - Schritt 3: „Hinzufügen" tippen
   - Hinweis: Funktioniert nur in Safari, nicht in Chrome/Firefox auf iOS → wenn In-App-Browser oder Chrome iOS erkannt, zusätzlicher Hinweis „Bitte in Safari öffnen".
3. **Android ohne nativen Prompt** (z. B. Firefox Android, oder schon dismissed): Anleitung mit „Menü → Zum Startbildschirm hinzufügen".
4. **Desktop ohne nativen Prompt**: Anleitung mit Adressleisten-Icon / Browser-Menü.

### PWA-Voraussetzungen prüfen

Damit die Installation überhaupt klappt, müssen Manifest + Icons korrekt sein. Ich prüfe und ergänze falls nötig:
- `public/manifest.json`: `display: "standalone"`, `start_url`, `scope`, `name`, `short_name`, `theme_color`, `background_color`, mindestens `192x192` und `512x512` Icons (maskable).
- `apple-touch-icon` (180×180) im `<head>` ist bereits in `__root.tsx` referenziert — Datei-Existenz verifizieren.
- iOS-spezifische Meta-Tags ergänzen (falls fehlen): `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`.

### Detection-Logik

- iOS: `/iPad|iPhone|iPod/.test(ua)` + Safari (kein CriOS/FxiOS) → nativer Add-to-Home-Screen-Flow möglich.
- iOS Chrome/Firefox: Hinweis „in Safari öffnen".
- Bereits installiert (standalone): Banner ausblenden (bereits implementiert).
- Im Lovable-Iframe: Banner ausblenden (bereits implementiert).

### UI

Modal nutzt bestehendes `Dialog` aus `@/components/ui/dialog`, monochrome Design (schwarz/weiß/grau) gemäß Memory.

## Geänderte Dateien

- `src/components/InstallBanner.tsx` — Button für iOS hinzufügen, Anleitungs-Modal, bessere Detection
- `public/manifest.json` — prüfen/ergänzen (Icons, display, scope)
- `src/routes/__root.tsx` — iOS-Meta-Tags ergänzen falls fehlend
- ggf. neue Icon-Assets in `public/` falls keine 192/512 vorhanden
