import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { privateHead } from "@/lib/seo";
import { supabase } from "@/integrations/supabase/client";
import { BrandHomeLink } from "@/components/BrandHomeLink";
import { ForgotPassword } from "@/components/ForgotPassword";
import { parseRecoveryUrl, validateNewPassword, PASSWORD_MIN_LENGTH } from "@/lib/password-reset";

export const Route = createFileRoute("/reset-password")({
  head: () => privateHead("Passwort zurücksetzen, MyTransporter"),
  component: ResetPasswordPage,
});

type Phase = "checking" | "ready" | "invalid" | "done";

function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [expired, setExpired] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    // URL vor jedem Client-Zugriff lesen, danach Token sofort aus der Adresszeile entfernen.
    const link = parseRecoveryUrl(window.location.href);
    let recoveryEvent = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") recoveryEvent = true;
    });
    const run = async () => {
      let ok = false;
      if (link.kind === "code") {
        ok = !(await supabase.auth.exchangeCodeForSession(link.code)).error;
      } else if (link.kind === "token_hash") {
        ok = !(await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: "recovery" })).error;
      } else if (link.kind === "implicit") {
        const { data } = await supabase.auth.getSession();
        ok = !!data.session || recoveryEvent;
      } else if (link.kind === "error") {
        setExpired(link.expired);
      }
      window.history.replaceState(null, "", "/reset-password");
      if (active) setPhase(ok ? "ready" : "invalid");
    };
    void run();
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const save = async () => {
    const v = validateNewPassword(pw, pw2);
    if (v) return setErr(v);
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
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
              {expired
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
