# Startseite aufräumen + Mietratgeber in der Hilfe

## Was entfernt wird (Startseite)

1. **Eigenwerbung „Hier werben: 29 € netto / 30 Tage · Desktop-Werbeplatz"** (der pillförmige Kasten oberhalb des Logos) wird komplett von der Startseite entfernt.
   - `src/components/HeroSection.tsx`: Einbindung von `HouseAdCta` entfernen.
   - `src/components/ads/HouseAdCta.tsx` bleibt als Datei bestehen (wird nowhere else gerenderd; keine Folge-Nutzung).

2. **Text zwischen Logo und „Buche deinen Transporter"** (Kurzbeschreibung „Transporter online mieten – stundenweise …" mit den Links Preise/Mietratgeber/FAQ/Kontakt) wird entfernt.
   - `src/routes/index.tsx`: `<HomeOfferSummary />` aus dem Seiteninhalt nehmen.
   - Hinweis: Dieser Absatz war Teil der AdSense-Qualitätsverbesserung (crawlbare Hilfelinks). Er wird entfernt, wie vom Eigentümer gewünscht; die Hilfeseiten selbst (/preise, /mietratgeber, /faq, /kontakt) bleiben unverändert bestehen und verlinkt (Footer, HomeIntroSection).

## Hilfe-Bubble erweitern

3. **HelpBubble** (`src/components/HelpBubble.tsx`): Neben Name, Telefon und E-Mail erhält die Bubble einen klickbaren Eintrag **„Mietratgeber"**, der zur bestehenden Seite `/mietratgeber` führt (TanStack `Link`, gleiche Optik wie die Telefon-/Mail-Zeilen, Icon `BookOpen`).

## Sonstiges

- AdSense: Es gibt nichts umzustellen – die Slots/Logik sind implementiert, bleiben aber solange inaktiv, bis Google die Seite freigibt und die Schalter (enabled/siteApproved/CMP) gesetzt werden.
- Keine Änderungen an Buchung, Zahlung, Backend, native App oder anderen Seiten.
- Danach: Typecheck, Tests, Produktionsbuild, kurzer Browser-Check (Desktop + 390 px mobil).
- Kein Publish.
