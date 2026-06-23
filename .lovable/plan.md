## 1. Partner-Seite: Nettopreise + 19% MwSt-Hinweis

Alle B2B-Preise auf `/partner` als **netto zzgl. 19% MwSt.** kennzeichnen.

- **`src/components/partner/PartnerPackages.tsx`**
  - Headline pro View: `… ab 29 € netto/Mon.`
  - Hauptpreis pro Karte: `29 € netto / Mon.` (kleiner Zusatz „zzgl. 19% MwSt." unter dem Preis)
  - Staffelpreise (1/2/3 Jahre): `… netto/Mon.`
  - Setup-Zeile: `Setup 49 € netto`
- **`src/components/partner/PartnerInquiryForm.tsx`** Zeile 91 → `… € netto/Mon.`
- **`src/routes/partner.tsx`** Meta-Description Zeile 24 → `ab 29 € netto / Monat (zzgl. MwSt.)`
- **`src/components/partner/PartnerBenefits.tsx`** prüfen und ggf. `netto` ergänzen, plus einen kleinen globalen Hinweisblock am Anfang der Pakete-Sektion: „Alle Preise verstehen sich netto in Euro zzgl. 19% gesetzlicher Umsatzsteuer."

Keine Änderung an `partner-packages.ts` selbst (Zahlen bleiben gleich – sie sind Nettopreise).

## 2. Registrierung: Privat vs. Firma

Beim Sign-up wählbar machen, ob Privatperson oder Firma. Bei Firma kommen Firmenname + optional USt-IdNr. dazu, damit später Rechnungen korrekt adressiert werden.

### DB-Migration (`profiles`-Tabelle erweitern)

```sql
alter table public.profiles
  add column if not exists account_type text not null default 'private'
    check (account_type in ('private','business')),
  add column if not exists company_name text,
  add column if not exists vat_id text;
```

`handle_new_user()`-Trigger erweitern, damit `account_type`, `company_name`, `vat_id` aus `raw_user_meta_data` ins Profil übernommen werden.

### UI: `src/components/Navbar.tsx` Registrier-Modal

- Toggle ganz oben: **Privat | Firma** (zwei Buttons, schwarz/weiß)
- Felder bei „Firma": zusätzlich `Firmenname` (Pflicht) + `USt-IdNr.` (optional)
- Bei „Privat": unverändert (Vorname/Nachname/Telefon)
- State erweitern: `accountType: 'private' | 'business'`, `companyName`, `vatId`
- `signUp({ options: { data: { …, account_type, company_name, vat_id } } })`
- Submit-Disable-Logik anpassen (Firma → companyName Pflicht statt firstName/lastName? Vorschlag: bei Firma sind firstName/lastName trotzdem Pflicht als Ansprechpartner – so können wir später Rechnung „Firmenname / z.Hd. Vorname Nachname" schreiben)

### UI: `src/components/BookingSection.tsx` Inline-Registrierung

Gleiche Erweiterung wie Navbar, identische Feldlogik – konsistent halten.

### Admin-Benachrichtigung

`sendAdminRegistrationNotification` erweitern um `accountType`, `companyName`, `vatId` und in der E-Mail anzeigen.

### Rechnung berücksichtigt Firma

In `src/lib/invoice-pdf.server.ts` „Rechnung an"-Block:
- bei `account_type = 'business'`: `Firmenname` (fett) + darunter `z.Hd. Vorname Nachname` + E-Mail; USt-IdNr. (falls vorhanden) als eigene Zeile
- bei `private`: unverändert
- `generateBookingInvoicePdf` lädt zusätzlich `account_type, company_name, vat_id` aus `profiles`

### Profil-Seite (optional, gleicher Aufschlag)

`src/routes/profil.tsx` zeigt Account-Typ + Firmenangaben und erlaubt nachträgliches Bearbeiten (Update auf `profiles`). Falls dir das jetzt zu viel ist, lass ich's weg – sag Bescheid.

## Frage

1. Soll die **Profil-Seite** das Bearbeiten von Firmenangaben gleich mit bekommen (Schritt 2.6) oder reicht erstmal nur Registrierung + Rechnung?
2. Bei einer **Firmen-Registrierung**: trotzdem Vor-/Nachname als Ansprechpartner verpflichtend (mein Vorschlag) – oder nur Firmenname?
