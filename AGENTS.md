# AGENTS

- Kamera/Foto-Helfer liegen in src/lib/image-capture.ts; alle Aufnahmen nutzen sie, damit kein stiller null/0-px-Fehler entsteht.
- Fahrtfotos speichern über src/lib/trip-photo-store.ts (Upload + bestätigter DB-Eintrag, signierte Vorschau); trip-photos.ts bleibt für bestehende Leser.
- Komponententests laufen mit jsdom per Datei-Kommentar und vollständig gemockten Diensten aus src/test/.
- Inklusivkilometer sind versioniert (KM_CATALOG_VERSION, LEGACY_FREE_KM, resolveCheckoutKmSnapshot, bookingFreeKm in booking-rules.ts); Altbuchungen und alte Stripe-Sessions dürfen nie mit gekürztem Neukatalog abgerechnet werden.
- Individuelles Kilometerpaket: einzige Preislogik in src/lib/custom-km.ts (Aufschlag auf unveränderte plan_id, Stripe-Metadata ck*, Webhook übernimmt Snapshot unverändert, addon id km_paket); damit UI, Checkout, Buchung und Storno dieselben Beträge nutzen.
