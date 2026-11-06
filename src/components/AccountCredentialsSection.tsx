import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

const SITE = "https://mytransporter.org";

/** Self-service email + password change. Old values stay in the admin change log. */
export function AccountCredentialsSection({ currentEmail }: { currentEmail: string | null }) {
  const [email, setEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    const parsed = z.string().trim().email().max(255).safeParse(email);
    if (!parsed.success) return setEmailMsg("Bitte eine gültige E-Mail-Adresse eingeben.");
    if (parsed.data.toLowerCase() === (currentEmail ?? "").toLowerCase()) return setEmailMsg("Das ist bereits deine E-Mail-Adresse.");
    setEmailBusy(true); setEmailMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ email: parsed.data }, { emailRedirectTo: `${SITE}/profil` });
      setEmailMsg(error ? `Änderung nicht möglich: ${error.message}` : `Wir haben einen Bestätigungslink an ${parsed.data} geschickt. Erst nach dem Klick gilt die neue Adresse.`);
      if (!error) setEmail("");
    } catch { setEmailMsg("Verbindung fehlgeschlagen. Bitte erneut versuchen."); }
    finally { setEmailBusy(false); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setPwMsg("Das neue Passwort braucht mindestens 8 Zeichen.");
    if (pw !== pw2) return setPwMsg("Die beiden neuen Passwörter stimmen nicht überein.");
    if (!cur) return setPwMsg("Bitte dein aktuelles Passwort eingeben.");
    setPwBusy(true); setPwMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw, current_password: cur } as never);
      setPwMsg(error ? `Änderung nicht möglich: ${error.message}` : "Dein Passwort wurde geändert.");
      if (!error) { setCur(""); setPw(""); setPw2(""); }
    } catch { setPwMsg("Verbindung fehlgeschlagen. Bitte erneut versuchen."); }
    finally { setPwBusy(false); }
  }

  const input = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm";
  const btn = "rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-medium disabled:opacity-50";
  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 px-1">Zugangsdaten</h2>
      <div className="rounded-2xl bg-card border border-border p-4 space-y-6">
        <form onSubmit={changeEmail} className="space-y-2">
          <p className="text-sm font-semibold">E-Mail-Adresse ändern</p>
          <p className="text-xs text-muted-foreground">Aktuell: {currentEmail ?? "-"}</p>
          <input type="email" autoComplete="email" className={input} placeholder="Neue E-Mail-Adresse" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" disabled={emailBusy} className={btn}>{emailBusy ? "Wird gesendet…" : "E-Mail ändern"}</button>
          {emailMsg && <p className="text-xs text-muted-foreground">{emailMsg}</p>}
        </form>
        <form onSubmit={changePassword} className="space-y-2">
          <p className="text-sm font-semibold">Passwort ändern</p>
          <input type="password" autoComplete="current-password" className={input} placeholder="Aktuelles Passwort" value={cur} onChange={(e) => setCur(e.target.value)} />
          <input type="password" autoComplete="new-password" className={input} placeholder="Neues Passwort" value={pw} onChange={(e) => setPw(e.target.value)} />
          <input type="password" autoComplete="new-password" className={input} placeholder="Neues Passwort wiederholen" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          <button type="submit" disabled={pwBusy} className={btn}>{pwBusy ? "Wird gespeichert…" : "Passwort ändern"}</button>
          {pwMsg && <p className="text-xs text-muted-foreground">{pwMsg}</p>}
        </form>
      </div>
    </section>
  );
}
