import { ForgotPassword } from "@/components/ForgotPassword";
import { useState } from "react";
import { LogIn, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import logoImage from "@/assets/logo.png";

interface Props {
  onSuccess: () => void;
}

export function AdminLogin({ onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    onSuccess();
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-sm w-full">
        <Link
          to="/"
          className="flex flex-col items-center mb-6 group"
          aria-label="Zur Startseite"
        >
          <img
            src={logoImage}
            alt="MyTransporter Logo"
            className="w-40 mb-2 transition-transform group-hover:scale-[1.02]"
          />
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
            <ArrowLeft className="w-3 h-3" />
            Zurück zur Startseite
          </span>
        </Link>
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Admin-Login</h1>
          <p className="text-sm text-muted-foreground mt-1">Nur für MyTransporter-Mitarbeiter</p>
        </div>
        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-Mail"
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passwort"
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-full bg-foreground py-3 text-background font-semibold disabled:opacity-50"
          >
            {loading ? "Anmelden…" : "Einloggen"}
          </button>
          <div className="text-center">
            <ForgotPassword initialEmail={email} />
          </div>
        </div>
      </div>
    </main>
  );
}