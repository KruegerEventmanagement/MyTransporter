import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requestPasswordReset } from "@/lib/password-reset";

/** Link „Passwort vergessen?“ mit kleinem Formular – für alle Login-Einstiege. */
export function ForgotPassword({ initialEmail = "" }: { initialEmail?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setEmail(initialEmail);
          setOpen(true);
        }}
        className="text-sm font-medium text-foreground underline underline-offset-2"
      >
        Passwort vergessen?
      </button>
    );
  }
  const send = async () => {
    setBusy(true);
    setMsg(null);
    const r = await requestPasswordReset(supabase, email, typeof window !== "undefined" ? window.location.origin : null);
    setMsg({ ok: r.ok, text: r.message });
    setBusy(false);
  };
  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-3 text-left space-y-2">
      <label className="block text-sm font-medium text-foreground">
        E-Mail für den Link zum Zurücksetzen
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={send}
          disabled={busy || !email}
          className="min-h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background disabled:opacity-40"
        >
          {busy ? "Wird gesendet…" : "Link senden"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-10 rounded-full px-4 text-sm">
          Schließen
        </button>
      </div>
      {msg && (
        <p role="status" className={`text-sm ${msg.ok ? "text-foreground" : "font-medium text-destructive"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
