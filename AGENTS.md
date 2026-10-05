# AGENTS

- Kamera/Foto-Helfer liegen in src/lib/image-capture.ts; alle Aufnahmen nutzen sie, damit kein stiller null/0-px-Fehler entsteht.
- Fahrtfotos speichern über src/lib/trip-photo-store.ts (Upload + bestätigter DB-Eintrag, signierte Vorschau); trip-photos.ts bleibt für bestehende Leser.
- Komponententests laufen mit jsdom per Datei-Kommentar und vollständig gemockten Diensten aus src/test/.
- Inklusivkilometer sind versioniert (KM_CATALOG_VERSION, LEGACY_FREE_KM, resolveCheckoutKmSnapshot, bookingFreeKm in booking-rules.ts); Altbuchungen und alte Stripe-Sessions dürfen nie mit gekürztem Neukatalog abgerechnet werden.
- Individuelles Kilometerpaket: einzige Preislogik in src/lib/custom-km.ts (Aufschlag auf unveränderte plan_id, Stripe-Metadata ck*, Webhook übernimmt Snapshot unverändert, addon id km_paket); damit UI, Checkout, Buchung und Storno dieselben Beträge nutzen.
- Admin-Kalenderdetails laufen nur über getCalendarEntryDetails (src/lib/calendar-details.server.ts): Client sendet Art+ID, Server prüft Admin-Rolle, verknüpft Profil/Dokumente nur per user_id bzw. reservation_id und signiert kurzfristig; damit nie fremde Pfade oder Kunden vertauscht werden.
- Awin-Partnerangebote kommen ausschließlich aus src/lib/affiliate.ts und erscheinen über AffiliateRail nur in den bestehenden xl-Seitenleisten; damit bleiben 9/8-Verteilung, sichere clickrefs, fehlende Vorab-Anfragen und Buchungs-State-Stabilität zentral geschützt.
- Aktive Miete: Auswahl/Phase in src/lib/active-trip.ts, Zeitfenster nur über src/lib/trip-time.ts (Spiegel von plan_end_at), Rückgabemeldung nur serverseitig über trip-return.server.ts (idempotent, vorhandener return_code wird wiederverwendet); damit Leiste, Fahrt, Erinnerung und Admin-Prüfung denselben Stand nutzen.
