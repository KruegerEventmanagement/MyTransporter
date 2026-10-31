# „Über uns“ nur mit Gründergeschichte

## Änderungen
- **Über uns:** Der Satz unter der Überschrift („Transporter L1H1 und L4H2 zum fairen Festpreis …“) wird entfernt.
- **Über uns:** Alles unterhalb der Gründergeschichte (Tarife, Kilometerpakete, Vorteile, Vergleich, Buchungsinfos, Werbefläche) wird entfernt. Es bleiben nur Überschrift, Foto, Geschichte und die Fußzeile.
- **Preise:** Tarife und Kilometerpakete stehen dort schon. Die Abschnitte „Vorteile“, „Vergleich“ und „Buchungsinfos“ kommen zusätzlich darunter, damit alles gesammelt und übersichtlich auf der Preisseite steht.
- Keine Preise oder Inhalte werden verändert, nur verschoben. Keine Veröffentlichung.

## Technische Details
- `src/routes/ueber-uns.tsx`: Untertitel, `AdRails`, Sektionen und `InFlowAd` entfernen; ungenutzte Imports löschen.
- `src/routes/preise.tsx`: `AdvantagesSection`, `CompareSection`, `BookingInfoSection` nach `AddonPackagesSection` einfügen.
- Werbetests zu `/ueber-uns` (InFlowAd-Test, ad-placements) an die entfernte Werbefläche anpassen und laufen lassen.
