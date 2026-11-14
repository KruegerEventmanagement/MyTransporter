# Kautions-Rückzahlung: Knopf nicht mehr stumm gesperrt

## Befund
Der Knopf "150,00 € jetzt per Stripe zurückzahlen" ist ausgegraut, aber es steht kein Grund daneben. Er wird gesperrt, wenn eine angehakte Abzugsposition (z. B. "Sonstiges", "Schaden") keinen Betrag hat. Genau diese Meldung wird aber nirgends angezeigt, nur beim Speichern als kurze Einblendung. Gespeichert war kein Entwurf, daher ist die konkrete Position noch unbestätigt; Stripe oder der Anbieter sind nicht die Ursache.

## Änderung
1. Direkt über dem Knopf jeden Sperrgrund sichtbar anzeigen: fehlender Betrag bei einer Position (mit Namen der Position), ungültiger Betrag, fehlende Begründung, Stripe-Sperre, "Wird verarbeitet …".
2. Die betroffene Position im Abzugsbereich markieren, damit klar ist, wo etwas fehlt.
3. Die Begründungs-Meldung immer zeigen, nicht erst nach Antippen.
4. Rückzahlungslogik, Stripe-Ablauf, Doppel-Erstattungsschutz und Beträge bleiben unverändert.

## Prüfung
- Test: angehakte Position ohne Betrag liefert sichtbaren Grund; vollständige Eingabe gibt Knopf frei.
- Im Browser die Kautionsansicht öffnen und den Zustand aus deinem Screenshot nachstellen. Keine echte Erstattung auslösen.

## Technisch
`src/components/admin/DepositsAdmin.tsx`: `draftItems.error`, `refundError`, `stripeBlocked`, `busy` zu einer Liste `blockReasons` zusammenführen und rendern; Prüflogik in kleine reine Funktion auslagern für den Test.
