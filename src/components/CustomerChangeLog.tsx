import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Row = { id: string; field: string; old_value: string | null; new_value: string | null; source: string; changed_at: string };

const LABELS: Record<string, string> = {
  first_name: "Vorname", last_name: "Nachname", phone: "Telefon", email: "E-Mail",
  birth_date: "Geburtsdatum", account_type: "Kontoart", company_name: "Firma", vat_id: "USt-ID",
  address_street: "Straße", address_postal_code: "PLZ", address_city: "Ort", address_country: "Land",
};
const SOURCES: Record<string, string> = { registrierung: "Registrierung", bestand: "Erster bekannter Stand", profil: "Änderung" };

/** Admin-only history of every customer data change (append-only, RLS admin). */
export function CustomerChangeLog({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.from("customer_change_log").select("id, field, old_value, new_value, source, changed_at")
      .eq("user_id", userId).order("changed_at", { ascending: true })
      .then(({ data }) => alive && setRows((data as Row[]) ?? []));
    return () => { alive = false; };
  }, [userId]);

  return (
    <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1">Änderungsverlauf</h2>
      {rows === null ? <p className="text-sm text-muted-foreground">Lädt…</p>
        : rows.length === 0 ? <p className="text-sm text-muted-foreground">Keine Einträge.</p>
        : (
          <ul className="divide-y divide-border text-sm">
            {rows.map((r) => (
              <li key={r.id} className="py-2">
                <div className="text-xs text-muted-foreground">
                  {new Date(r.changed_at).toLocaleString("de-DE")} · {SOURCES[r.source] ?? r.source} · {LABELS[r.field] ?? r.field}
                </div>
                <div className="break-words">
                  {r.old_value != null && <span className="line-through text-muted-foreground mr-2">{r.old_value}</span>}
                  <span className="font-medium">{r.new_value ?? "(leer)"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
