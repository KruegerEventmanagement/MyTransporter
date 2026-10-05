import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";

export function DeleteAccountSection() {
  const del = useServerFn(deleteMyAccount);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await del({ data: { confirm: text } });
      if (!r.ok) {
        setMsg(r.reason);
        return;
      }
      await supabase.auth.signOut().catch(() => {});
      window.location.assign("/");
    } catch {
      setMsg("Löschen fehlgeschlagen. Bitte versuche es erneut oder schreibe an info@mytransporter.org.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="konto-loeschen">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 px-1">Konto löschen</h2>
      <div className="rounded-2xl bg-card border border-border p-4 text-sm">
        <p className="text-muted-foreground">
          Löscht dein Konto, Profil, hochgeladene Dokumente und Benachrichtigungen dauerhaft. Buchungen und Rechnungen
          bewahren wir wegen gesetzlicher Aufbewahrungspflichten auf.
        </p>
        {!open ? (
          <button onClick={() => setOpen(true)} className="mt-3 min-h-11 rounded-full border border-foreground px-5 font-medium">
            Konto löschen
          </button>
        ) : (
          <div className="mt-3 space-y-2">
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
                disabled={busy || text !== "LÖSCHEN"}
                onClick={run}
                className="min-h-11 rounded-full bg-foreground px-5 font-medium text-background disabled:opacity-40"
              >
                {busy ? "Wird gelöscht…" : "Endgültig löschen"}
              </button>
              <button onClick={() => setOpen(false)} className="min-h-11 rounded-full px-5">Abbrechen</button>
            </div>
          </div>
        )}
        {msg && <p role="alert" className="mt-2 font-medium">{msg}</p>}
      </div>
    </section>
  );
}
