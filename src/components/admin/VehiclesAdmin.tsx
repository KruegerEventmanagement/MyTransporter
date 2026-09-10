import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Car, Plus, Trash2, Upload, X, FileText, Image as ImageIcon, Save, ChevronLeft } from "lucide-react";

interface Vehicle {
  id: string;
  name: string;
  plate: string;
  vin: string | null;
  brand: string | null;
  model: string | null;
  vehicle_class: string | null;
  body_type: string | null;
  first_registration: string | null;
  displacement_ccm: number | null;
  power_kw: number | null;
  fuel_type: string | null;
  seats: number | null;
  empty_weight_kg: number | null;
  max_weight_kg: number | null;
  payload_kg: number | null;
  manufacturer: string | null;
  type_variant_version: string | null;
  hsn: string | null;
  tsn: string | null;
  color: string | null;
  axles: number | null;
  trailer_load_braked_kg: number | null;
  trailer_load_unbraked_kg: number | null;
  tire_size: string | null;
  owner_name: string | null;
  notes: string | null;
  photo_urls: string[];
  registration_doc_url: string | null;
  is_active: boolean;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  cargo_length_cm: number | null;
  cargo_width_cm: number | null;
  cargo_height_cm: number | null;
  cargo_volume_m3: number | null;
  pickup_location: string | null;
  pickup_address: string | null;
}

const empty: Partial<Vehicle> = {
  name: "",
  plate: "",
  photo_urls: [],
  is_active: true,
};

export function VehiclesAdmin() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("vehicles").select("*").order("created_at", { ascending: false });
    setVehicles((data ?? []) as Vehicle[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (editing || creating) {
    return (
      <VehicleEditor
        vehicle={editing ?? (empty as Vehicle)}
        isNew={creating}
        onClose={() => {
          setEditing(null);
          setCreating(false);
          load();
        }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Fahrzeuge</h2>
        <button
          onClick={() => setCreating(true)}
          className="rounded-full bg-foreground text-background px-4 py-2 text-xs font-semibold flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Neues Fahrzeug
        </button>
      </div>

      {loading ? (
        <p className="text-center text-sm text-muted-foreground py-12">Lädt…</p>
      ) : vehicles.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">Noch keine Fahrzeuge angelegt.</p>
      ) : (
        <ul className="space-y-2">
          {vehicles.map((v) => (
            <li key={v.id}>
              <button
                onClick={() => setEditing(v)}
                className="w-full text-left p-4 rounded-2xl bg-card border border-border hover:bg-secondary/40 transition-all flex items-center gap-3"
              >
                <div className="w-14 h-14 rounded-xl bg-secondary overflow-hidden flex items-center justify-center shrink-0">
                  {v.photo_urls?.[0] ? (
                    <img src={v.photo_urls[0]} alt={v.name} className="w-full h-full object-cover" />
                  ) : (
                    <Car className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">
                    {v.name || `${v.brand ?? ""} ${v.model ?? ""}`.trim() || "Unbenanntes Fahrzeug"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {v.plate || "-"} · {v.fuel_type ?? "-"} · {v.power_kw ? `${v.power_kw} kW` : "-"}
                  </p>
                </div>
                {!v.is_active && (
                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-secondary text-muted-foreground">
                    Inaktiv
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VehicleEditor({
  vehicle,
  isNew,
  onClose,
}: {
  vehicle: Vehicle;
  isNew: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Vehicle>({ ...vehicle, photo_urls: vehicle.photo_urls ?? [] });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Vehicle>(key: K, value: Vehicle[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const numField = (key: keyof Vehicle) => ({
    type: "number" as const,
    value: (form[key] as number | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      set(key, (e.target.value === "" ? null : Number(e.target.value)) as never),
  });

  const txtField = (key: keyof Vehicle) => ({
    value: (form[key] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, (e.target.value || null) as never),
  });

  const upload = async (file: File, prefix: string) => {
    const ext = file.name.split(".").pop() ?? "bin";
    const rand = Math.random().toString(36).slice(2, 10);
    const path = `${form.id ?? "new"}/${prefix}-${Date.now()}-${rand}.${ext}`;
    const { error } = await supabase.storage.from("vehicles").upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("vehicles").getPublicUrl(path);
    return data.publicUrl;
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => upload(f, "photo")));
      set("photo_urls", [...(form.photo_urls ?? []), ...urls]);
    } catch (err) {
      alert("Upload fehlgeschlagen: " + (err as Error).message);
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await upload(file, "registration");
      set("registration_doc_url", url);
    } catch (err) {
      alert("Upload fehlgeschlagen: " + (err as Error).message);
    } finally {
      setUploading(false);
      if (docInputRef.current) docInputRef.current.value = "";
    }
  };

  const removePhoto = (url: string) => {
    set("photo_urls", form.photo_urls.filter((u) => u !== url));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        plate: form.plate,
        vin: form.vin,
        brand: form.brand,
        model: form.model,
        vehicle_class: form.vehicle_class,
        body_type: form.body_type,
        first_registration: form.first_registration || null,
        displacement_ccm: form.displacement_ccm,
        power_kw: form.power_kw,
        fuel_type: form.fuel_type,
        seats: form.seats,
        empty_weight_kg: form.empty_weight_kg,
        max_weight_kg: form.max_weight_kg,
        payload_kg: form.payload_kg,
        manufacturer: form.manufacturer,
        type_variant_version: form.type_variant_version,
        hsn: form.hsn,
        tsn: form.tsn,
        color: form.color,
        axles: form.axles,
        trailer_load_braked_kg: form.trailer_load_braked_kg,
        trailer_load_unbraked_kg: form.trailer_load_unbraked_kg,
        tire_size: form.tire_size,
        owner_name: form.owner_name,
        notes: form.notes,
        photo_urls: form.photo_urls,
        registration_doc_url: form.registration_doc_url,
        is_active: form.is_active,
      };
      if (isNew) {
        const { error } = await supabase.from("vehicles").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vehicles").update(payload).eq("id", form.id);
        if (error) throw error;
      }
      onClose();
    } catch (err) {
      alert("Speichern fehlgeschlagen: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm("Fahrzeug wirklich löschen?")) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", form.id);
    if (error) {
      alert("Löschen fehlgeschlagen: " + error.message);
      return;
    }
    onClose();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-4 h-4" /> Zurück
        </button>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              onClick={remove}
              className="rounded-full bg-secondary px-3 py-2 text-xs font-medium flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="w-3.5 h-3.5" /> Löschen
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-full bg-foreground text-background px-4 py-2 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" /> {saving ? "Speichert…" : "Speichern"}
          </button>
        </div>
      </div>

      <Section title="Fotos">
        <div className="grid grid-cols-3 gap-2">
          {form.photo_urls.map((url) => (
            <div key={url} className="relative aspect-square rounded-xl overflow-hidden bg-secondary">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removePhoto(url)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <label className="aspect-square rounded-xl bg-secondary border-2 border-dashed border-border flex flex-col items-center justify-center text-xs text-muted-foreground cursor-pointer hover:border-foreground">
            <ImageIcon className="w-5 h-5 mb-1" />
            {uploading ? "…" : "Foto"}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhoto}
            />
          </label>
        </div>
      </Section>

      <Section title="Allgemein">
        <Field label="Anzeigename"><input className={inp} {...txtField("name")} /></Field>
        <Field label="Kennzeichen"><input className={inp} {...txtField("plate")} /></Field>
        <Field label="Aktiv">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
            />
            Verfügbar für Buchungen
          </label>
        </Field>
      </Section>

      <Section title="Zulassungsbescheinigung Teil I">
        <Field label="A · Amtliches Kennzeichen"><input className={inp} {...txtField("plate")} /></Field>
        <Field label="B · Tag der Erstzulassung">
          <input
            type="date"
            className={inp}
            value={form.first_registration ?? ""}
            onChange={(e) => set("first_registration", e.target.value || null)}
          />
        </Field>
        <Field label="C.1.1 · Halter"><input className={inp} {...txtField("owner_name")} /></Field>
        <Field label="D.1 · Marke"><input className={inp} {...txtField("brand")} /></Field>
        <Field label="D.3 · Handelsbezeichnung / Modell"><input className={inp} {...txtField("model")} /></Field>
        <Field label="E · Fahrzeug-Identifizierungsnr. (FIN)"><input className={inp} {...txtField("vin")} /></Field>
        <Field label="F.1 · Zul. Gesamtmasse (kg)"><input className={inp} {...numField("max_weight_kg")} /></Field>
        <Field label="P.2 · Nennleistung (kW)"><input className={inp} {...numField("power_kw")} /></Field>
        <Field label="P.3 · Kraftstoffart"><input className={inp} {...txtField("fuel_type")} /></Field>
        <Field label="R · Farbe"><input className={inp} {...txtField("color")} /></Field>
        <Field label="S.1 · Sitzplätze"><input className={inp} {...numField("seats")} /></Field>
        <Field label="Nutzlast (kg)"><input className={inp} {...numField("payload_kg")} /></Field>
      </Section>

      <Section title="Notizen">
        <textarea
          className={`${inp} min-h-[100px]`}
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value || null)}
          placeholder="Interne Notizen…"
        />
      </Section>

      <Section title="Zulassungsbescheinigung Teil I (Scan / Foto)">
        {form.registration_doc_url ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary">
            <FileText className="w-5 h-5 shrink-0" />
            <a
              href={form.registration_doc_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium underline truncate flex-1"
            >
              Hochgeladenes Dokument öffnen
            </a>
            <button
              onClick={() => set("registration_doc_url", null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Entfernen
            </button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 p-4 rounded-xl bg-secondary border-2 border-dashed border-border cursor-pointer hover:border-foreground text-sm">
            <Upload className="w-4 h-4" />
            {uploading ? "Lädt hoch…" : "Datei hochladen (PDF / Bild)"}
            <input
              ref={docInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleDoc}
            />
          </label>
        )}
      </Section>
    </div>
  );
}

const inp =
  "w-full rounded-xl bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card border border-border p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}