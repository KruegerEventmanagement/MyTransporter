# Live-Modus auch in der Vorschau

## Was geändert wird
- In `.env.development` den Test-Token (`pk_test_…`) durch den bereits vorhandenen Live-Token (`pk_live_…`) aus `.env.production` ersetzen.

## Auswirkung
- Der orange „Test-Modus"-Banner verschwindet auch in der Lovable-Vorschau.
- Zahlungen in der Vorschau sind ab sofort **echte Zahlungen** über dein Stripe-Konto (inkl. 200 € Kaution).
- Live-Seite `mytransporter.org` bleibt unverändert im Live-Modus.

## Wichtig
Testkarten wie `4242 4242 4242 4242` funktionieren in der Vorschau danach nicht mehr. Falls du selbst eine Buchung zum Testen machst, wird echtes Geld abgebucht und du musst es im Admin-Bereich wieder erstatten (Stripe-Gebühren fallen an).
