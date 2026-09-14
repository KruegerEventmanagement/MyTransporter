# Plan: "Über uns" aus der Navbar entfernen

## Was wird geändert
Der Navigationspunkt "Über uns" (`Link to="/ueber-uns"`) wird aus der oberen Navigationsleiste (`src/components/Navbar.tsx`) entfernt.

## Was NICHT geändert wird
- Die Route `/ueber-uns` bleibt bestehen — sie ist über die Footer-Links auf der Startseite und der Preisseite erreichbar und in der Sitemap/SEO eingebunden.
- Footer-Links auf `/` und `/preise` bleiben erhalten.
- Alle anderen Navigationspunkte ("Werbefläche", "Langzeitmiete", "Preise", Login/Registrieren) bleiben unverändert.

## Warum
Der Punkt ist inhaltlich redundant mit "Preise" und die Inhalte sind über die Footer bereits zugänglich. Die Navbar wird dadurch auf kleinen iPhones etwas ruhiger.

## Umfang
- 1 Datei: `src/components/Navbar.tsx` — die drei Zeilen des `<Link to="/ueber-uns">`-Blocks entfernen.
