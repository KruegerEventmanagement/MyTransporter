## Ziel

Die Werbeflächen sollen wie auf dem hochgeladenen, beklebten Sponsoren-Transporter aussehen: dicht aneinander, vollständig auf dem Blech, **mit echten Karosserie-Konturen** (Schrägen an der Fahrertür zum Radkasten, Dreiecks-Ecke oben über der Tür, Heckecke nach hinten verjüngt). Keine Flächen mehr über Scheinwerfern, Reifen, Plastik oder in der Luft.

## Was sich konkret ändert

Datei: `src/lib/partner-zones.ts` — komplett neu mit echten Polygonen statt `rect()`-Helper.

### Fahrerseite (van-driver.jpg, 1536×1024) — 11 Zonen

Aus dem Foto abgeleitete Karosserie-Grenzen (van schaut nach links):
- Vorderer Radkasten-Bogen: x ≈ 220–380, oben y ≈ 670
- Fahrertür: x ≈ 380–555, unten endet am schwarzen Sill (y ≈ 720)
- Großer Laderaum-Block: x ≈ 555–1370, oben y ≈ 295, unten y ≈ 720
- Hinterer Radkasten-Bogen: x ≈ 1175–1340
- Hintere Eckverjüngung: ab x ≈ 1370 geht die Karosserie schräg nach oben

Neue Zonen:

- **D1 — Fahrertür (Trapez mit Rundung)**: Polygon mit Punkten, die unten dem Radkasten-Bogen folgen (5 Punkte, abgeschrägte vordere Unterkante), oben unter dem Fenster gerade.
- **D2 — Dreieck oben hinter Fahrerfenster**: 3-Punkt-Polygon im Eck (B-Säule-Bereich), füllt die kleine Dreiecksfläche oberhalb der Tür / hinter dem Fenster.
- **D3–D6 — obere Lade-Reihe (4 Kacheln)**: gleichmäßige Rechtecke ca. 200×195 px, y 295→490, x 555→1365.
- **D7–D10 — untere Lade-Reihe (4 Kacheln)**: gleichmäßige Rechtecke ca. 200×220 px, y 490→715, x 555→1365.
- **D11 — Heckeck-Streifen (Polygon mit Schräge)**: schmale Fläche x 1370→1455, oben verjüngt (oben breiter, unten schmaler, folgt dem hinteren Aufstieg der Karosserie).

→ 11 Zonen statt vorher 16. Keine Zonen mehr über Scheinwerfer (D16 entfällt), keine schwebenden D1/D2 vor der Tür.

### Beifahrerseite (van-passenger.jpg, 1536×1024) — 11 Zonen, gespiegelt

Van schaut nach rechts. Schiebetür-Mitte (x ≈ 740) wird **nicht** als separate Naht behandelt — Werbung darf über die Schiebetür-Naht laufen (so wie auf dem Referenzfoto auch).

- **P1 — Beifahrertür (Trapez mit Rundung)**: spiegelverkehrt zu D1, vordere Unterkante folgt dem rechten Radkasten.
- **P2 — Dreieck oben hinter Beifahrerfenster**: spiegelverkehrt zu D2.
- **P3–P6 — obere Lade-Reihe (4 Kacheln)**.
- **P7–P10 — untere Lade-Reihe (4 Kacheln)**.
- **P11 — Heckeck-Streifen (Polygon mit Schräge)** auf der linken Bildseite (hintere Fahrzeugseite).

### Heck (van-rear.jpg, 1024×1024) — 4 Zonen

Über den Fenstern und unter den Fenstern, jeweils 2 Spalten (links/rechts der Mittelnaht). Die Bereiche neben den Rückleuchten werden **weggelassen** (zu schmal und Plastik-nah).
- **R1, R2** — Header über den beiden Fenstern (y 175→260).
- **R3, R4** — Türpanele unter den Fenstern, oberhalb des schwarzen Stoßfängers (y 480→700, x von Rückleuchten-Innenkante bis Mittelnaht/andere Seite).

### Front (van-front.jpg, 1024×1024) — 2 Zonen

- **F1 — Dachstreifen** über der Windschutzscheibe (Trapez, oben schmaler wegen Dachrundung): x 280→745, y 150→220.
- **F2 — Motorhaube** zwischen Scheinwerfern, über dem Kühlergrill: leicht trapezförmig (oben schmaler), x 295→730, y 460→555. **Geht nicht** über die schwarzen Scheinwerfer-Plastikteile.

## Polygon-Geometrie (Beispiel D1 Fahrertür)

Statt `rect(380, 510, 175, 210)` jetzt 6-Punkt-Polygon:
```text
"380,510 555,510 555,720 430,720 395,705 380,665"
```
- Vordere Unterkante (395,705 → 380,665) schmiegt sich an die Radkasten-Rundung
- Hintere Kante senkrecht zur B-Säule

Ähnlich für D2 (Dreieck): `"380,295 555,295 555,400"` — Dreieck, das den Bereich unter der Dachrundung über der Tür füllt.

## Technische Details

- `polygonAreaPx` (Shoelace) funktioniert bereits für beliebige Polygone → Preisberechnung automatisch korrekt für neue Formen.
- `pxPerMeter` Werte bleiben: Driver/Passenger 220, Rear 297, Front 366.
- `TransporterPhotoDiagram.tsx` rendert bereits `<polygon points={...}>` → keine Komponenten-Änderung nötig.
- `src/routes/partner.tsx` Default-Selektion bleibt auf erstem Zonen-Code (jetzt "D1" Fahrertür statt "D4").
- Inquiry-Formular und Server-Funktion sind bereits dynamisch (akzeptieren beliebige Zonen-Codes) → keine Änderung.

## Ergebnis

- 28 Zonen total (11+11+4+2) statt 38, aber **deckungsgleich mit Karosserie**.
- Tür ist ein Trapez mit abgerundeter Vorderkante zum Radkasten.
- Dreiecks-Zone oben über der Tür (wie im Referenzfoto die kleinen Sponsoren-Aufkleber im oberen Eck).
- Heckeck verjüngt sich nach oben.
- Keine Zone mehr über Reifen, Scheinwerfern, Plastik-Sill oder Stoßfängern.

## Geänderte Dateien
- `src/lib/partner-zones.ts` (Komplett-Rewrite mit Polygonen)
- `src/routes/partner.tsx` (Default-Zone "D1")
