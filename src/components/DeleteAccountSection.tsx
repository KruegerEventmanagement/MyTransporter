import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount, getMyDeletionStatus } from "@/lib/account.functions";
import { formatBerlinDateTime } from "@/lib/privacy-format";

/** Lokale Daten dieses Geräts nach erfolgreicher Löschung entfernen (awaited). */
async function clearLocalData(clearQueries: () => void) {
  const { clearLocalAccountData } = await import("@/lib/account-local-cleanup");
  await clearLocalAccountData({
    signOut: () => supabase.auth.signOut({ scope: "local" }),
    clearQueries,
    disablePush: async () => (await import("@/lib/push-client")).disablePushOnThisDevice(),
    projectId: import.meta.env.VITE_SUPABASE_PROJECT_ID,
  });
}

export function DeleteAccountSection() {
  const queryClient = useQueryClient();
  const del = useServerFn(deleteMyAccount);
  const status = useServerFn(getMyDeletionStatus);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    status()
      .then((s) => {
        if (s && s.status !== "completed") setPending(s.requestedAt);
      })
      .catch(() => {});
  }, [status]);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await del({ data: { confirm: text, password } });
      if (!r.ok) {
        setMsg(r.reason);
        if ("requested" in r && r.requested && r.requestedAt) setPending(r.requestedAt);
        return;
      }
      await clearLocalData(() => queryClient.clear());
      window.location.assign("/konto-loeschen?geloescht=1");
    } catch {
      setMsg("Löschen fehlgeschlagen. Bitte versuche es erneut oder schreibe an info@mytransporter.org.");
    } finally {
      setBusy(false);
      setPassword("");
    }
  };

  return (
    <section id="konto-loeschen">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 px-1">Konto löschen</h2>
      <div className="rounded-2xl bg-card border border-border p-4 text-sm">
        <p className="text-muted-foreground">
          Löscht dein Anmeldekonto samt Sitzungen, dein Profil, Mitteilungs-Registrierungen und Geburtstagsaktionen
          endgültig. Buchungen und Rechnungen bewahren wir wegen gesetzlicher Aufbewahrungspflichten getrennt auf.
          Ausweis-/Führerscheinkopien zu einem Mietvertrag bleiben gesperrt bis 90 Tage nach Vertragsende, sonst
          werden sie sofort gelöscht.
        </p>
        {pending && (
          <p role="status" className="mt-3 font-medium">
            Dein Löschantrag vom {formatBerlinDateTime(pending).date} um {formatBerlinDateTime(pending).time} Uhr ist
            gespeichert und in Bearbeitung. Nach Ende der Miete wird dein Konto automatisch gelöscht (stündliche Prüfung).
          </p>
        )}
        {!open ? (
          <button onClick={() => setOpen(true)} className="mt-3 min-h-11 rounded-full border border-foreground px-5 font-medium">
            Konto löschen
          </button>
        ) : (
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <label className="block">
              Dein Passwort zur Bestätigung
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              />
              <span className="text-xs text-muted-foreground">
                Ohne Passwort (z. B. Google-Anmeldung) nur direkt nach einer neuen Anmeldung möglich.
              </span>
            </label>
            <label className="block">
              Zur Bestätigung <b>LÖSCHEN</b> eingeben
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
                autoCapitalize="characters"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || text !== "LÖSCHEN"}
                className="min-h-11 rounded-full bg-foreground px-5 font-medium text-background disabled:opacity-40"
              >
                {busy ? "Wird gelöscht…" : "Endgültig löschen"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-full px-5">Abbrechen</button>
            </div>
          </form>
        )}
        {msg && <p role="alert" className="mt-2 font-medium">{msg}</p>}
      </div>
    </section>
  );
}
