## Problem

Beim Hochladen eines Fahrzeugfotos antwortet der Storage mit `403 – new row violates row-level security policy`, obwohl der angemeldete Nutzer Admin ist.

## Ursache

Die Datenbankfunktion `public.has_role(uuid, app_role)` ist **nicht** als `SECURITY DEFINER` markiert. Sie läuft daher mit den Rechten des aufrufenden Nutzers (`authenticated`). Die Rolle `authenticated` hat aber **kein `GRANT SELECT` auf `public.user_roles`** (nur `sandbox_exec` hat Rechte). Dadurch schlägt der interne `SELECT` in `has_role` fehl, die Funktion liefert effektiv „false", und die Storage-Policy „Admins can upload vehicle assets" verweigert den Upload.

Das gleiche Problem betrifft potenziell alle Stellen, an denen `has_role` aus einer RLS-Policy heraus aufgerufen wird (z. B. Vehicles-Tabelle, Buchungen, Admin-Benachrichtigungen) – es ist nur bislang nicht überall aufgefallen.

## Fix (eine Migration)

1. `public.has_role` neu anlegen mit `SECURITY DEFINER`, `STABLE`, `SET search_path = public` (Standard-Empfehlung für Role-Checks, vermeidet RLS-Rekursion und Berechtigungsprobleme).
2. `GRANT SELECT ON public.user_roles TO authenticated;` ergänzen, damit auch direkte Reads (z. B. der bestehende Client-Call `select role from user_roles where user_id = …`) sauber funktionieren.
3. `GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;` zur Sicherheit.

## Verifikation

- Migration anwenden.
- Im Admin-Bereich „Fahrzeuge → Bearbeiten → Foto hochladen" testen: Upload muss `200` liefern, Foto erscheint in der Galerie und nach Speichern in `vehicles.photo_urls`.
- Bestehende Admin-Reads (Buchungen, Notifications) weiter prüfen, dass keine Regression auftritt.

## Keine Code-Änderungen am Frontend nötig

Der Upload-Code in `src/components/admin/VehiclesAdmin.tsx` ist korrekt; der Bug liegt ausschließlich in der Datenbank-Policy/Funktion.
