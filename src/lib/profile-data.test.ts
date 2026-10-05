import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { addressFromRow, loadOwnProfile, saveOwnProfileData } from "@/lib/profile-data";
import { addressSignUpMetadata, addressProfileColumns } from "@/lib/address";

function db(opts: { select?: { data: unknown; error: unknown }; update?: { data: unknown; error: unknown } }) {
  const update = vi.fn();
  const q: any = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => opts.select ?? { data: null, error: null },
    update: (patch: unknown) => {
      update(patch);
      return { eq: () => ({ select: async () => opts.update ?? { data: [{ id: "u" }], error: null } }) };
    },
  };
  return { client: { from: () => q }, update };
}

const ADDR = { street: "", postalCode: "", city: "", country: "" };

describe("Profil-Stammdaten", () => {
  it("Ladefehler ≠ fehlendes Profil; NULL-Altprofil ergibt leere Felder", async () => {
    expect((await loadOwnProfile(db({ select: { data: null, error: { message: "x" } } }).client, "u")).status).toBe("error");
    expect((await loadOwnProfile(db({ select: { data: null, error: null } }).client, "u")).status).toBe("missing");
    const r = await loadOwnProfile(db({ select: { data: { address_street: null }, error: null } }).client, "u");
    expect(r.status).toBe("ok");
    expect(addressFromRow(r.row)).toEqual(ADDR);
  });

  it("nach fehlgeschlagenem Laden wird nie geschrieben (kein Leerschreiben)", async () => {
    for (const status of ["error", "missing", "loading"] as const) {
      const { client, update } = db({});
      const res = await saveOwnProfileData(client, "u", status, "", ADDR);
      expect(res.ok).toBe(false);
      expect(update).not.toHaveBeenCalled();
    }
  });

  it("fehlende Sitzung oder fehlgeschlagenes Update ist kein Erfolg", async () => {
    const a = db({});
    expect((await saveOwnProfileData(a.client, null, "ok", "", ADDR)).ok).toBe(false);
    expect(a.update).not.toHaveBeenCalled();
    const b = db({ update: { data: null, error: { message: "rls" } } });
    expect((await saveOwnProfileData(b.client, "u", "ok", "", ADDR)).ok).toBe(false);
    const c = db({ update: { data: [], error: null } });
    expect((await saveOwnProfileData(c.client, "u", "ok", "", ADDR)).ok).toBe(false);
  });

  it("geladenes Profil: bewusstes Löschen schreibt NULL", async () => {
    const { client, update } = db({});
    const res = await saveOwnProfileData(client, "u", "ok", "1990-01-01", ADDR);
    expect(res.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({
      birth_date: "1990-01-01", address_street: null, address_postal_code: null, address_city: null, address_country: null,
    });
  });
});

describe("Adress-Metadaten bei Registrierung", () => {
  it("trimmt, PLZ bleibt Text, kein Standard-Land", () => {
    expect(addressSignUpMetadata({ street: " Weg 1 ", postalCode: "01234", city: "Ort", country: "" })).toEqual({
      address_street: "Weg 1", address_postal_code: "01234", address_city: "Ort", address_country: "",
    });
    expect(addressProfileColumns({ ...ADDR, postalCode: "01234" }).address_postal_code).toBe("01234");
  });

  it("beide Registrierungen senden die Adressfelder mit (Quelltextprüfung)", () => {
    for (const f of ["src/components/BookingSection.tsx", "src/components/Navbar.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).toMatch(/\.\.\.addressSignUpMetadata\(/);
      expect(src).toMatch(/<AddressFields/);
    }
    expect(readFileSync("src/components/Navbar.tsx", "utf8")).toMatch(/setAddress\(EMPTY_ADDRESS\)/);
  });

  it("aktueller Profil-Trigger übernimmt Adresse und erhält alle bisherigen Felder", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const latest = [...files].reverse().find((f) => readFileSync(`${dir}/${f}`, "utf8").includes("FUNCTION public.handle_new_user"));
    const sql = readFileSync(`${dir}/${latest}`, "utf8");
    for (const k of ["address_street", "address_postal_code", "address_city", "address_country"]) {
      expect(sql).toContain(`NULLIF(trim(NEW.raw_user_meta_data->>'${k}'), '')`);
    }
    for (const k of ["first_name", "last_name", "phone", "account_type", "company_name", "vat_id", "birth_date",
      "birthday_marketing_consent", "birthday_consent_at", "admin_notifications", "Neue Registrierung", "SECURITY DEFINER"]) {
      expect(sql).toContain(k);
    }
  });
});
