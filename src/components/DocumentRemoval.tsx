import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { removeMyDocuments } from "@/lib/account.functions";
import type { DocGroup } from "@/lib/document-retention";

const LABEL: Record<DocGroup, string> = { id: "Ausweis", license: "Führerschein" };

/** Ausweis bzw. Führerschein einzeln aus dem Konto entfernen – mit ehrlichem Hinweis. */
export function DocumentRemoval({ available, onDone }: { available: Set<string>; onDone: () => void }) {
  const remove = useServerFn(removeMyDocuments);
  const [confirm, setConfirm] = useState<DocGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const groups: DocGroup[] = (["id", "license"] as const).filter((g) =>
    [...available].some((t) => t.startsWith(g === "id" ? "id_" : "license_")),
  );
  if (groups.length === 0 && !msg) return null;

  const run = async (g: DocGroup) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await remove({ data: { group: g } });
      setMsg(
        r.ok
          ? r.archived > 0
            ? `${LABEL[g]} wurde aus deinem Konto entfernt. Eine Kopie bleibt bis zum Ende der Aufbewahrungsfrist (90 Tage nach Vertragsende) nur für unser Team gesperrt gespeichert und wird danach gelöscht.`
            : `${LABEL[g]} wurde aus deinem Konto entfernt und gelöscht.`
          : r.reason,
      );
      setConfirm(null);
      onDone();
    } catch {
      setMsg("Entfernen fehlgeschlagen. Bitte versuche es erneut.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 text-sm">
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <button
            key={g}
            onClick={() => setConfirm(g)}
            className="min-h-11 rounded-full border border-foreground px-4 font-medium"
          >
            {LABEL[g]} aus meinem Konto entfernen
          </button>
        ))}
      </div>
      {confirm && (
        <div role="dialog" aria-modal="true" aria-label={`${LABEL[confirm]} entfernen`} className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <p>
            Dein {LABEL[confirm]} wird aus deinem Konto entfernt und ist für dich nicht mehr sichtbar. Das ist{" "}
            <b>keine sofortige vollständige Löschung</b>: Gehört das Dokument zu einem Mietvertrag, bewahren wir eine
            gesperrte Kopie nur für unser Team bis 90 Tage nach Vertragsende auf und löschen sie danach automatisch.
            Ohne Mietvertrag wird es sofort gelöscht.
          </p>
          <p className="text-muted-foreground">Für neue Buchungen musst du es danach erneut hochladen.</p>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => run(confirm)}
              className="min-h-11 rounded-full bg-foreground px-5 font-medium text-background disabled:opacity-40"
            >
              {busy ? "Wird entfernt…" : "Aus meinem Konto entfernen"}
            </button>
            <button onClick={() => setConfirm(null)} className="min-h-11 rounded-full px-5">Abbrechen</button>
          </div>
        </div>
      )}
      {msg && <p role="status" className="font-medium">{msg}</p>}
    </div>
  );
}
