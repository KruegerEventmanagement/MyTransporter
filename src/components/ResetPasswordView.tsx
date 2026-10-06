import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandHomeLink } from "@/components/BrandHomeLink";
import { ForgotPassword } from "@/components/ForgotPassword";
import {
  parseRecoveryUrl,
  resolveRecovery,
  validateNewPassword,
  PASSWORD_MIN_LENGTH,
  type RecoveryLink,
} from "@/lib/password-reset";

type Phase = "checking" | "ready" | "invalid" | "done";

export function ResetPasswordView() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [hint, setHint] = useState<"expired" | "invalid" | "network">("invalid");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const linkRef = useRef<RecoveryLink | null>(null);
  const activeRef = useRef(true);

  const readyRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  // Prüfungen laufen streng nacheinander; eine bestätigte Recovery-Sitzung wird nie wieder auf "invalid" gesetzt.
  const check = useCallback((link: RecoveryLink) => {
    queueRef.current = queueRef.current.then(async () => {
      if (readyRef.current) return;
      let ok = false;
      let nextHint: "expired" | "invalid" | "network" = "invalid";
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = await resolveRecovery(supabase as any, link, Math.floor(Date.now() / 1000));
        ok = r.ok;
        if (!r.ok) nextHint = r.network ? "network" : r.expired ? "expired" : "invalid";
      } catch {
        nextHint = "network";
      }
      if (ok) readyRef.current = true;
      if (!activeRef.current) return;
      if (ok) setPhase("ready");
      else if (!readyRef.current) {
        setHint(nextHint);
        setPhase("invalid");
      }
    });
    return queueRef.current;
  }, []);

  useEffect(() => {
    activeRef.current = true;
    // Ursprünglichen Link einmal erfassen; die URL bleibt stehen, bis der Client ihn konsumiert hat.
    const link = parseRecoveryUrl(window.location.href);
    linkRef.current = link;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") void check({ kind: "none" });
    });
    void (async () => {
      try {
        // Wartet auf die asynchrone detectSessionInUrl-Initialisierung (liest die URL selbst).
        await supabase.auth.initialize();
      } catch {
        /* Fehler zeigt die anschließende Prüfung */
      }
      try {
        await check(link);
      } finally {
        // Token erst nach Konsum/Prüfung aus der Adresszeile entfernen – auch bei Fehlern.
        if (window.location.pathname === "/reset-password" && (window.location.hash || window.location.search)) {
          window.history.replaceState(null, "", "/reset-password");
        }
      }
    })();
    return () => {
      activeRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, [check]);

  const save = async () => {
    const v = validateNewPassword(pw, pw2);
    if (v) return setErr(v);
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) {
        setErr(
          /same|different/i.test(error.message)
            ? "Bitte wähle ein anderes Passwort als bisher."
            : "Das Passwort konnte nicht gespeichert werden. Bitte fordere einen neuen Link an.",
        );
        return;
      }
      setPhase("done");
      window.setTimeout(() => window.location.replace("/profil"), 1500);
    } catch {
      setErr("Verbindung fehlgeschlagen. Bitte versuche es erneut.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <BrandHomeLink className="absolute left-4 top-3" imageClassName="h-7 w-auto" />
      <section className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-foreground text-center">Passwort zurücksetzen</h1>
        {phase === "checking" && (
          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Link wird geprüft …
          </p>
        )}
        {phase === "invalid" && (
          <div className="mt-6 space-y-4 text-sm">
            <p role="alert" className="text-foreground">
              {hint === "network"
                ? "Der Link konnte gerade nicht geprüft werden. Bitte prüfe deine Verbindung und öffne den Link erneut."
                : hint === "expired"
                  ? "Dieser Link ist abgelaufen oder wurde bereits verwendet."
                  : "Dieser Link ist ungültig oder unvollständig."}{" "}
              Fordere einfach einen neuen an.
            </p>
            <ForgotPassword />
          </div>
        )}
        {phase === "ready" && (
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="block text-sm font-medium">
              Neues Passwort
              <input
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <label className="block text-sm font-medium">
              Neues Passwort wiederholen
              <input
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <p className="text-xs text-muted-foreground">Mindestens {PASSWORD_MIN_LENGTH} Zeichen.</p>
            {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-12 rounded-full bg-foreground font-medium text-background disabled:opacity-40"
            >
              {busy ? "Wird gespeichert…" : "Passwort speichern"}
            </button>
          </form>
        )}
        {phase === "done" && (
          <p role="status" className="mt-6 text-center text-sm">
            Dein Passwort wurde geändert. Du wirst weitergeleitet …
          </p>
        )}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">Zur Startseite</Link>
        </p>
      </section>
    </main>
  );
}
