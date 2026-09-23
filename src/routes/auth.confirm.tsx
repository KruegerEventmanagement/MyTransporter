import { useEffect, useState } from "react";
import { privateHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const PROFILE_URL = "/profil";
const FALLBACK_URL = "/?email_confirmed=1#booking";

export const Route = createFileRoute("/auth/confirm")({
  head: () => privateHead("E-Mail bestätigt, MyTransporter"),
  component: AuthConfirmPage,
});

function AuthConfirmPage() {
  const [message, setMessage] = useState("E-Mail wird bestätigt …");

  useEffect(() => {
    let active = true;

    const finishConfirmation = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error && active) {
          setMessage("Bestätigung abgeschlossen. Du wirst weitergeleitet …");
        }
      } else if (tokenHash) {
        const otpType = type === "email_change" ? "email_change" : "signup";
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType,
        });
        if (error && active) {
          setMessage("Bestätigung abgeschlossen. Du wirst weitergeleitet …");
        }
      } else {
        await supabase.auth.getSession();
      }

      if (!active) return;

      const { data: userData } = await supabase.auth.getUser();
      const isLoggedIn = !!userData.user;
      setMessage(
        isLoggedIn
          ? "E-Mail bestätigt – du bist eingeloggt. Weiterleitung …"
          : "E-Mail bestätigt. Du wirst weitergeleitet …",
      );
      window.history.replaceState(null, "", "/auth/confirm");
      window.setTimeout(() => {
        window.location.replace(isLoggedIn ? PROFILE_URL : FALLBACK_URL);
      }, 600);
    };

    void finishConfirmation();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-sm text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
          {message.startsWith("E-Mail bestätigt") ? (
            <Check className="h-8 w-8 text-foreground" aria-hidden="true" />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-foreground" aria-hidden="true" />
          )}
        </div>
        <h1 className="mt-6 text-2xl font-bold text-foreground">MyTransporter</h1>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      </section>
    </main>
  );
}