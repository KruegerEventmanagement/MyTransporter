# Über-uns-Seite mit persönlicher Geschichte von Christian

## Was sich ändert
Die vorhandene Seite „Über uns“ (im Footer schon verlinkt) bekommt oben einen persönlichen Abschnitt:

- Dein Foto (weißes Hemd, grauer Hintergrund) mittig, rund oder dezent abgerundet, mit Namen „Christian Krüger – Gründer von MyTransporter“.
- Darunter **ein durchgehender, schön geschriebener Fließtext** in mehreren Absätzen – **ohne Nummerierung, ohne „Erstens/Zweitens“, ohne Zwischenüberschriften mit Zahlen**. Nur ruhige Absätze mit etwas Abstand.
- Inhalt der Absätze (sinngemäß aus deiner Geschichte):
  1. Der Tisch von Eltingen nach Ezach – kein freier Transporter in Leonberg, Umweg nach Stuttgart.
  2. Daraus entstand die Idee: Transporter direkt vor Ort, einfach online buchen, faire Preise.
  3. Ehrlichkeit zum Zustand: die Fahrzeuge sind rund 18 Jahre alt, haben Gebrauchsspuren und kleine Macken – aber TÜV, neue Bremsen, laufende Wartung; Sicherheit hat Vorrang.
  4. Bitte um Verständnis und ein faires Miteinander – dafür bezahlbare Preise.
  5. Persönlicher Abschluss mit Gruß „Christian“.
  (Diese Liste dient nur der Planung – auf der Seite erscheint alles als zusammenhängender Text.)
- Dezente Schwarz/Weiß-Box im bestehenden Stil, Fredoka-Schrift.
- Die übrigen Inhalte der Seite (Tarife, Vorteile usw.) bleiben darunter unverändert.
- Der Text wird auch in die sechs anderen Sprachen sinngemäß übersetzt.

## Technische Details
- `src/routes/ueber-uns.tsx`: neuer Abschnitt oberhalb von `TariffSection`; Foto per `lovable-assets` aus dem Upload als `src/assets/christian-krueger.jpeg.asset.json`.
- Texte über bestehende i18n-Kataloge (Deutsch als Quelle); Übersetzungs-Vollständigkeitstest laufen lassen.
- Meta-Beschreibung leicht ergänzen (Gründergeschichte). Keine Veröffentlichung.
