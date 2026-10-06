import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listPrivacyRecords, getArchivedDocumentUrl, retryAccountDeletion, setArchiveReviewHold } from "@/lib/admin-privacy.functions";
import { formatBerlinDateTime } from "@/lib/privacy-format";

type Deletion = {
  id: string;
  former_user_id: string;
  status: string;
  account_created_at: string | null;
  requested_at: string;
  completed_at: string | null;
  booking_count: number | null;
  attempts: number;
  last_error: string | null;
};
type Archive = {
  id: string;
  user_id: string;
  doc_type: string;
  archived_at: string;
  retention_until: string;
  retention_reason: string;
  legal_hold_until: string | null;
  purged_at: string | null;
};

const DOC_LABEL: Record<string, string> = {
  id_front: "Ausweis vorne",
  id_back: "Ausweis hinten",
  license_front: "Führerschein vorne",
  license_back: "Führerschein hinten",
};

export function deletionLabel(d: Pick<Deletion, "status" | "requested_at" | "completed_at">): string {
  if (d.status === "completed" && d.completed_at) {
    const { date, time } = formatBerlinDateTime(d.completed_at);
    return `Account wurde am ${date} um ${time} Uhr gelöscht`;
  }
  const { date, time } = formatBerlinDateTime(d.requested_at);
  if (d.status === "failed") return `Löschung am ${date} um ${time} Uhr beantragt – fehlgeschlagen, Wiederholung nötig`;
  return `Löschung am ${date} um ${time} Uhr beantragt – in Bearbeitung (noch nicht gelöscht)`;
}

export function AdminPrivacy() {
  const list = useServerFn(listPrivacyRecords);
  const sign = useServerFn(getArchivedDocumentUrl);
  const retry = useServerFn(retryAccountDeletion);
  const hold = useServerFn(setArchiveReviewHold);
  const [note, setNote] = useState<string | null>(null);
  const reload = () => list().then((r) => setData(r as { deletions: Deletion[]; archive: Archive[] })).catch(() => {});
  const doRetry = async (id: string) => {
    const r = await retry({ data: { id } }).catch(() => ({ ok: false as const, reason: "Fehler." }));
    setNote(r.ok ? "Löschung abgeschlossen." : r.reason);
    void reload();
  };
  const doHold = async (id: string) => {
    const reason = window.prompt("Begründung für den Prüfvermerk (z. B. konkreter Schadensfall, mind. 10 Zeichen):")?.trim();
    if (!reason) return;
    const days = Number(window.prompt("Dauer in Tagen (1–180):", "30"));
    const r = await hold({ data: { id, days, reason } }).catch(() => ({ ok: false as const, reason: "Ungültige Angaben." }));
    setNote(r.ok ? "Prüfvermerk gesetzt." : r.reason);
    void reload();
  };
  const [data, setData] = useState<{ deletions: Deletion[]; archive: Archive[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    list()
      .then((r) => setData(r as { deletions: Deletion[]; archive: Archive[] }))
      .catch(() => setErr("Daten konnten nicht geladen werden."));
  }, [list]);

  const open = async (id: string) => {
    const r = await sign({ data: { id } });
    if (r.url) window.open(r.url, "_blank", "noopener");
    else setNote("Aufbewahrung abgelaufen – Kopie kann nicht mehr angesehen werden.");
  };

  if (err) return <p role="alert">{err}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Wird geladen …</p>;
  return (
    <div className="space-y-8">
      {note && <p role="status" className="text-sm font-medium">{note}</p>}
      <section>
        <h2 className="font-bold mb-2">Kontolöschungen</h2>
        {data.deletions.length === 0 && <p className="text-sm text-muted-foreground">Keine Einträge.</p>}
        <ul className="space-y-2">
          {data.deletions.map((d) => (
            <li key={d.id} className="rounded-xl border border-border p-3 text-sm">
              <p className="font-medium">{deletionLabel(d)}</p>
              <p className="text-muted-foreground text-xs mt-1">
                Frühere Kunden-ID {d.former_user_id}
                {d.account_created_at && ` · registriert ${formatBerlinDateTime(d.account_created_at).date}`}
                {d.booking_count != null && ` · ${d.booking_count} Buchung(en) bleiben erhalten`}
              </p>
              {d.status !== "completed" && (
                <button onClick={() => doRetry(d.id)} className="mt-2 rounded-full border border-foreground px-3 py-1 text-xs">
                  Löschung erneut ausführen
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-bold mb-2">Dokumentarchiv (befristet)</h2>
        {data.archive.length === 0 && <p className="text-sm text-muted-foreground">Keine archivierten Kopien.</p>}
        <ul className="space-y-2">
          {data.archive.map((a) => (
            <li key={a.id} className="rounded-xl border border-border p-3 text-sm">
              <p className="font-medium">
                {DOC_LABEL[a.doc_type] ?? a.doc_type} · Kunde {a.user_id.slice(0, 8)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{a.retention_reason}</p>
              <p className="text-xs mt-1">
                {a.purged_at
                  ? `Endgültig gelöscht am ${formatBerlinDateTime(a.purged_at).date}`
                  : `Aufbewahrung bis ${formatBerlinDateTime(a.retention_until).date}`}
                {a.legal_hold_until && !a.purged_at && ` · Prüfvermerk bis ${formatBerlinDateTime(a.legal_hold_until).date}`}
              </p>
              {!a.purged_at && (
                <button onClick={() => open(a.id)} className="mt-2 rounded-full border border-foreground px-3 py-1 text-xs">
                  Ansehen (60 s gültig)
                </button>
              )}
              {!a.purged_at && (
                <button onClick={() => doHold(a.id)} className="mt-2 ml-2 rounded-full border border-border px-3 py-1 text-xs">
                  Befristeten Prüfvermerk setzen
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
