import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import {
  listBirthdayCampaigns,
  listProfilesMissingBirthDate,
  setCustomerBirthDate,
  type BirthdayCampaignRow,
  type MissingBirthDateRow,
} from "@/lib/birthday.functions";

function de(iso: string | null): string {
  if (!iso) return "–";
  const d = iso.slice(0, 10).split("-");
  return `${d[2]}.${d[1]}.${d[0]}`;
}

function euro(cents: number | null): string {
  if (cents == null) return "–";
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

const STATUS_LABEL: Record<string, string> = {
  sent: "versendet",
  failed: "fehlgeschlagen",
  pending: "offen",
};

export function BirthdayAdmin() {
  const loadCampaigns = useServerFn(listBirthdayCampaigns);
  const loadMissing = useServerFn(listProfilesMissingBirthDate);
  const saveBirthDate = useServerFn(setCustomerBirthDate);

  const [rows, setRows] = useState<BirthdayCampaignRow[]>([]);
  const [missing, setMissing] = useState<MissingBirthDateRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, m] = await Promise.all([loadCampaigns({}), loadMissing({})]);
      setRows(c);
      setMissing(m);
    } catch {
      setError("Daten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Laden…</p>;

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Geburtstagsaktionen
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Geburtstagsaktionen versendet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Empfänger</th>
                  <th className="px-3 py-2 text-left">Geburtstag</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Rabatt</th>
                  <th className="px-3 py-2 text-left">Gültig bis</th>
                  <th className="px-3 py-2 text-left">Versand</th>
                  <th className="px-3 py-2 text-left">Eingelöst</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">{r.recipient}</td>
                    <td className="px-3 py-2">{de(r.birthday_on)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.coupon_code}</td>
                    <td className="px-3 py-2">
                      {r.discount_percent} %{r.discount_cents ? ` · ${euro(r.discount_cents)}` : ""}
                    </td>
                    <td className="px-3 py-2">{de(r.valid_until)}</td>
                    <td className="px-3 py-2">
                      {STATUS_LABEL[r.email_status] ?? r.email_status}
                      {r.email_error ? (
                        <span className="block text-xs text-destructive">{r.email_error}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{r.redeemed_at ? `ja · ${de(r.redeemed_at)}` : "nein"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Fehlende Geburtsdaten
        </h2>
        {missing.length === 0 ? (
          <p className="text-sm text-muted-foreground">Alle Kunden haben ein Geburtsdatum.</p>
        ) : (
          <ul className="space-y-2">
            {missing.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3"
              >
                <span className="text-sm font-medium">{m.name}</span>
                <span className="text-xs text-muted-foreground">{m.email}</span>
                <input
                  type="date"
                  value={drafts[m.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                  className="ml-auto rounded-xl border border-border bg-background px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  disabled={!drafts[m.id]}
                  onClick={async () => {
                    try {
                      await saveBirthDate({ data: { userId: m.id, birthDate: drafts[m.id]! } });
                      await refresh();
                    } catch {
                      setError("Speichern fehlgeschlagen.");
                    }
                  }}
                  className="rounded-full bg-foreground text-background px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                >
                  Speichern
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
